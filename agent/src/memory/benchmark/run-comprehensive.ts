/**
 * Comprehensive Memory Benchmark v4
 *
 * Tests MemorySystem(Mem0Adapter) pipeline: importance gating + decay + reconsolidation + mem0 vector search.
 * All 12 capabilities from query-templates.json.
 * With/without memory comparison → delta = memory contribution.
 *
 * Judge: LLM-based (Gemini Pro + Claude CLI dual judge by default).
 * Configurable via CLI args.
 *
 * Usage:
 *   pnpm exec tsx src/memory/benchmark/run-comprehensive.ts [options]
 *
 * Options:
 *   --judge=gemini-pro|claude-cli|keyword|dual   (default: dual)
 *   --categories=recall,abstention,...            (default: all)
 *   --skip-no-memory                             (skip without-memory baseline)
 *   --runs=N                                     (runs per test, default: 1)
 *
 * Requires: GEMINI_API_KEY env var
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MemorySystem } from "../index.js";
import { Mem0Adapter } from "../adapters/mem0.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const THROTTLE_MS = 2000;

// ─── CLI Args ────────────────────────────────────────────────────────────────

function parseArgs(): {
	judge: "gemini-pro" | "claude-cli" | "keyword" | "dual";
	categories: string[] | null;
	skipNoMemory: boolean;
	runs: number;
} {
	const args = process.argv.slice(2);
	let judge: any = "dual";
	let categories: string[] | null = null;
	let skipNoMemory = false;
	let runs = 1;

	for (const arg of args) {
		if (arg.startsWith("--judge=")) judge = arg.split("=")[1];
		if (arg.startsWith("--categories=")) categories = arg.split("=")[1].split(",");
		if (arg === "--skip-no-memory") skipNoMemory = true;
		if (arg.startsWith("--runs=")) runs = parseInt(arg.split("=")[1], 10);
	}
	return { judge, categories, skipNoMemory, runs };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

async function throttle(): Promise<void> {
	await new Promise((r) => setTimeout(r, THROTTLE_MS));
}

async function callGemini(
	apiKey: string, messages: Array<{ role: string; content: string }>,
	maxTokens: number, model = "gemini-2.5-flash",
): Promise<string> {
	for (let attempt = 0; attempt < 3; attempt++) {
		await throttle();
		try {
			const res = await fetch(`${GEMINI_BASE}chat/completions`, {
				method: "POST",
				headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
				body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
			});
			if (!res.ok) {
				await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
				continue;
			}
			const data = await res.json() as any;
			const content = data.choices?.[0]?.message?.content ?? "";
			if (content.length > 0) return content;
		} catch {}
		await new Promise((r) => setTimeout(r, 2000));
	}
	return "";
}

function callClaudeCli(prompt: string): string {
	try {
		const result = execSync(
			`claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" --max-tokens 100 2>/dev/null`,
			{ timeout: 30000, encoding: "utf-8" },
		);
		return result.trim();
	} catch {
		return "";
	}
}

async function askWithMemory(apiKey: string, memories: string[], question: string): Promise<string> {
	const memCtx = memories.length > 0
		? `<recalled_memories>\n${memories.map((m) => `- ${m}`).join("\n")}\n</recalled_memories>`
		: "(관련 기억 없음)";

	return callGemini(apiKey, [
		{ role: "system", content: `당신은 사용자의 개인 AI 동반자입니다.

## 규칙
1. 기억 중에서 사용자 질문과 **관련된 것**을 활용하세요.
2. 사용자가 도움을 요청하면, 기억에 있는 사용자의 선호와 환경을 **자연스럽게 반영**하세요.
3. 사용자가 자신에 대한 사실을 물어보는데 기억에 없으면 "기억에 없습니다"라고 답하세요.
4. 기억에 없는 **사실**을 절대 지어내지 마세요.
5. 여러 기억을 종합해서 답할 수 있으면 종합하세요.

${memCtx}` },
		{ role: "user", content: question },
	], 300);
}

async function askWithoutMemory(apiKey: string, question: string): Promise<string> {
	return callGemini(apiKey, [
		{ role: "system", content: "당신은 AI 어시스턴트입니다. 사용자에 대해 아는 정보가 없습니다. 모르는 것은 모른다고 답하세요." },
		{ role: "user", content: question },
	], 300);
}

// ─── LLM Judge ───────────────────────────────────────────────────────────────

interface JudgeResult { pass: boolean; reason: string }

function buildJudgePrompt(q: any, capName: string, response: string): string {
	if (capName === "abstention") {
		return `[채점] 메모리 시스템 벤치마크 — abstention (환각 방지)

질문: "${q.query || q.verify}"
AI 응답: "${response}"

이 질문은 사용자가 **말한 적 없는 것**에 대한 질문입니다.
AI는 "기억에 없다/말한 적 없다/모르겠다"고 거절해야 합니다.

판정:
- AI가 없는 정보를 지어내지 않고 거절했으면 → PASS
- AI가 없는 정보를 자신있게 답했으면 → FAIL
- AI가 관련 있는 다른 정보를 언급하며 "이건 기억에 없다"고 구분했으면 → PASS

첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (capName === "irrelevant_isolation") {
		const forbidden = (q.expected_not_contains ?? []).join(", ");
		return `[채점] 메모리 시스템 벤치마크 — irrelevant_isolation

질문: "${q.query}"
AI 응답: "${response}"
응답에 포함되면 안 되는 키워드: [${forbidden}]

이 질문은 사용자 기억과 무관한 일반 질문입니다.
AI가 불필요하게 사용자 개인정보(이름, 주소 등)를 끼워넣으면 FAIL.

첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		return `[채점] 메모리 시스템 벤치마크 — ${capName}

질문: "${q.query || q.verify}"
AI 응답: "${response}"
기대 키워드 중 ${min}개 이상: [${q.expected_any.join(", ")}]

AI 응답이 위 키워드 중 ${min}개 이상을 의미적으로 포함하면 PASS.
정확한 단어가 아니어도 같은 의미면 PASS (예: "달리기" = "러닝").

첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (q.expected_contains) {
		return `[채점] 메모리 시스템 벤치마크 — ${capName}

질문: "${q.query || q.verify}"
AI 응답: "${response}"
기대 키워드: [${q.expected_contains.join(", ")}]
${q.expected_not_contains?.length ? `포함되면 안 되는 키워드: [${q.expected_not_contains.join(", ")}]` : ""}
${q.fail_signal?.length ? `이런 응답이면 FAIL: [${q.fail_signal.join(", ")}]` : ""}

AI 응답이 기대 키워드 중 하나라도 의미적으로 포함하면 PASS.
포함 금지 키워드가 있으면 FAIL.

첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	return `[채점] 메모리 시스템 벤치마크 — ${capName}

질문: "${q.query || q.verify}"
AI 응답: "${response}"

이 AI 응답이 질문에 적절히 답했으면 PASS, 아니면 FAIL.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
}

function parseVerdict(raw: string): JudgeResult {
	const first = raw.split("\n")[0].trim().toUpperCase();
	const pass = first === "PASS" || first.startsWith("PASS");
	return { pass, reason: raw.slice(0, 120) || "EMPTY" };
}

async function judgeWithGeminiPro(apiKey: string, prompt: string): Promise<JudgeResult> {
	const raw = await callGemini(apiKey, [{ role: "user", content: prompt }], 100, "gemini-2.5-pro");
	if (!raw) return { pass: false, reason: "EMPTY(gemini-pro)" };
	return parseVerdict(raw);
}

function judgeWithClaudeCli(prompt: string): JudgeResult {
	const raw = callClaudeCli(prompt);
	if (!raw) return { pass: false, reason: "EMPTY(claude-cli)" };
	return parseVerdict(raw);
}

async function judge(
	apiKey: string, mode: string, q: any, capName: string, response: string,
): Promise<JudgeResult> {
	const prompt = buildJudgePrompt(q, capName, response);

	if (mode === "gemini-pro") {
		return judgeWithGeminiPro(apiKey, prompt);
	}
	if (mode === "claude-cli") {
		return judgeWithClaudeCli(prompt);
	}
	if (mode === "dual") {
		const gResult = await judgeWithGeminiPro(apiKey, prompt);
		const cResult = judgeWithClaudeCli(prompt);

		if (gResult.pass === cResult.pass) {
			return { pass: gResult.pass, reason: `[agree] G:${gResult.reason.slice(0, 40)} | C:${cResult.reason.slice(0, 40)}` };
		}
		// Disagreement — conservative: FAIL unless both say PASS
		return { pass: false, reason: `[disagree] G:${gResult.pass?"P":"F"} C:${cResult.pass?"P":"F"} | G:${gResult.reason.slice(0, 40)} | C:${cResult.reason.slice(0, 40)}` };
	}

	// keyword fallback (legacy)
	return keywordJudge(response, q, capName);
}

// ─── Keyword Judge (legacy fallback) ─────────────────────────────────────────

function keywordJudge(response: string, q: any, capName: string): JudgeResult {
	const lower = response.toLowerCase();

	if (capName === "abstention") {
		const refusals = ["말씀하신 적", "기억에 없", "모르", "없는 것 같", "언급하신 적", "기억이 없", "알 수 없", "말한 적", "정보가 없", "없습니다", "아닙니다", "죄송"];
		if (refusals.some((p) => lower.includes(p))) return { pass: true, reason: "PASS(kw): refusal" };
		return { pass: false, reason: "FAIL(kw): no refusal" };
	}
	if (capName === "irrelevant_isolation") {
		const found = (q.expected_not_contains ?? []).filter((k: string) => lower.includes(k.toLowerCase()));
		if (found.length > 0) return { pass: false, reason: `FAIL(kw): forbidden [${found}]` };
		return { pass: true, reason: "PASS(kw)" };
	}
	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		const found = q.expected_any.filter((k: string) => lower.includes(k.toLowerCase()));
		return found.length >= min
			? { pass: true, reason: `PASS(kw): [${found}]` }
			: { pass: false, reason: `FAIL(kw): ${found.length}/${q.expected_any.length}` };
	}
	if (q.expected_contains) {
		const found = q.expected_contains.filter((k: string) => lower.includes(k.toLowerCase()));
		return found.length > 0
			? { pass: true, reason: `PASS(kw): [${found}]` }
			: { pass: false, reason: `FAIL(kw): none found` };
	}
	return { pass: false, reason: "NO_JUDGE" };
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

interface TestResult {
	id: string;
	capability: string;
	query: string;
	weight: number;
	isBonus: boolean;
	withMemory: { response: string; pass: boolean; reason: string; memories: string[] };
	noMemory?: { response: string; pass: boolean; reason: string };
}

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) { console.error("GEMINI_API_KEY required"); process.exit(1); }

	const config = parseArgs();
	console.log(`Config: judge=${config.judge}, runs=${config.runs}, skipNoMemory=${config.skipNoMemory}`);
	if (config.categories) console.log(`  categories: ${config.categories.join(", ")}`);

	const factBank = JSON.parse(readFileSync(join(import.meta.dirname, "fact-bank.json"), "utf-8"));
	const templates = JSON.parse(readFileSync(join(import.meta.dirname, "query-templates.json"), "utf-8"));

	// ─── Phase 1: Encode via MemorySystem(Mem0Adapter) ───────────────────
	console.log("\n=== Phase 1: Encoding via MemorySystem(Mem0Adapter) ===\n");
	const dbPath = `/tmp/mem0-comp-${randomUUID()}`;
	const adapter = new Mem0Adapter({
		mem0Config: {
			embedder: { provider: "openai", config: { apiKey, baseURL: GEMINI_BASE, model: "gemini-embedding-001" } },
			vectorStore: { provider: "memory", config: { collectionName: "comp", dimension: 3072, dbPath: `${dbPath}-vec.db` } },
			llm: { provider: "openai", config: { apiKey, baseURL: GEMINI_BASE, model: "gemini-2.5-flash" } },
			historyDbPath: `${dbPath}-hist.db`,
		},
		userId: "bench",
	});
	const system = new MemorySystem({ adapter });

	for (const fact of factBank.facts) {
		try {
			await throttle();
			const episode = await system.encode({ content: fact.statement, role: "user" }, { project: "benchmark" });
			console.log(`  ${episode ? "✅" : "⛔"} ${fact.id}: ${fact.statement.slice(0, 50)}...`);
		} catch (err: any) {
			console.log(`  ❌ ${fact.id}: ${err.message?.slice(0, 60)}`);
		}
	}

	// Verify
	const allFacts = await adapter.semantic.getAll();
	console.log(`\n  Stored: ${allFacts.length} facts\n`);

	// ─── Phase 2: Run tests ──────────────────────────────────────────────
	console.log("=== Phase 2: Testing ===\n");
	const results: TestResult[] = [];
	let testNum = 0;

	for (const [capName, cap] of Object.entries(templates.capabilities) as [string, any][]) {
		if (!cap.queries) continue;
		if (config.categories && !config.categories.includes(capName)) continue;

		const weight = cap.weight ?? 1;
		const isBonus = cap.is_bonus ?? false;
		console.log(`── ${capName} (w:${weight}${isBonus ? " bonus" : ""}) ──`);

		for (const q of cap.queries) {
			testNum++;
			const id = `${capName.slice(0, 4).toUpperCase()}-${String(testNum).padStart(2, "0")}`;
			const query = q.query || q.verify || "";
			if (!query) continue;

			// Handle setup/update/noise
			if (q.setup) { await throttle(); await system.encode({ content: q.setup, role: "user" }, { project: "benchmark" }); }
			if (q.update) { await throttle(); await system.encode({ content: q.update, role: "user" }, { project: "benchmark" }); }
			if (q.noisy_input) { await throttle(); await system.encode({ content: q.noisy_input, role: "user" }, { project: "benchmark" }); }

			// ── WITH memory ──
			let memories: string[] = [];
			try {
				await throttle();
				const result = await system.recall(query, { project: "benchmark", topK: 20 });
				memories = [...result.facts.map((f) => f.content), ...result.episodes.map((e) => e.content)];
			} catch (err: any) {
				console.error(`    ⚠ recall: ${err.message?.slice(0, 60)}`);
			}
			const withMemResp = await askWithMemory(apiKey, memories, query);
			const withMemJudge = await judge(apiKey, config.judge, q, capName, withMemResp);

			// ── WITHOUT memory ──
			let noMemResult: TestResult["noMemory"] | undefined;
			if (!config.skipNoMemory) {
				const noMemResp = await askWithoutMemory(apiKey, query);
				const noMemJudge = await judge(apiKey, config.judge, q, capName, noMemResp);
				noMemResult = { response: noMemResp.slice(0, 200), pass: noMemJudge.pass, reason: noMemJudge.reason };
			}

			results.push({
				id, capability: capName, query, weight, isBonus,
				withMemory: { response: withMemResp.slice(0, 200), pass: withMemJudge.pass, reason: withMemJudge.reason, memories },
				noMemory: noMemResult,
			});

			const wIcon = withMemJudge.pass ? "✅" : "❌";
			const nIcon = noMemResult ? (noMemResult.pass ? "✅" : "❌") : "⏭";
			console.log(`  ${id} "${query.slice(0, 30)}..." — mem:${wIcon} noMem:${nIcon}`);
			console.log(`    judge: ${withMemJudge.reason.slice(0, 80)}`);
		}
		console.log();
	}

	// ─── Phase 3: Report ─────────────────────────────────────────────────
	const core = results.filter((r) => !r.isBonus);
	const bonus = results.filter((r) => r.isBonus);
	const memPass = core.filter((r) => r.withMemory.pass).length;
	const noMemPass = config.skipNoMemory ? 0 : core.filter((r) => r.noMemory?.pass).length;
	const bonusMemPass = bonus.filter((r) => r.withMemory.pass).length;

	const byCap: Record<string, { mem: number; noMem: number; total: number; weight: number }> = {};
	for (const r of results) {
		if (!byCap[r.capability]) byCap[r.capability] = { mem: 0, noMem: 0, total: 0, weight: r.weight };
		byCap[r.capability].total++;
		if (r.withMemory.pass) byCap[r.capability].mem++;
		if (r.noMemory?.pass) byCap[r.capability].noMem++;
	}

	const coreRate = memPass / core.length;
	const bonusRate = bonus.length > 0 ? bonusMemPass / bonus.length : 0;
	const abstentionFail = results.some((r) => r.capability === "abstention" && !r.withMemory.pass);
	let grade: string;
	if (abstentionFail) grade = "F (abstention fail)";
	else if (coreRate >= 0.9 && bonusRate >= 0.5) grade = "A";
	else if (coreRate >= 0.75) grade = "B";
	else if (coreRate >= 0.6) grade = "C";
	else grade = "F";

	console.log("═══════════════════════════════════════════════════════════");
	console.log("  COMPREHENSIVE MEMORY BENCHMARK");
	console.log(`  Judge: ${config.judge}`);
	console.log("═══════════════════════════════════════════════════════════\n");
	console.log(`  Core:  ${memPass}/${core.length} (${Math.round(coreRate * 100)}%)${config.skipNoMemory ? "" : ` | noMem: ${noMemPass}/${core.length} (${Math.round(noMemPass / core.length * 100)}%)`}`);
	if (!config.skipNoMemory) console.log(`  Delta: +${memPass - noMemPass} (memory contribution)`);
	console.log(`  Bonus: ${bonusMemPass}/${bonus.length}`);
	console.log(`  Grade: ${grade}\n`);

	for (const [name, c] of Object.entries(byCap)) {
		const b = c.weight === 0 ? "*" : "";
		console.log(`  ${name}${b}: ${c.mem}/${c.total}${config.skipNoMemory ? "" : ` (noMem: ${c.noMem}/${c.total})`}`);
	}

	// Disagreements (dual judge)
	const disagreements = results.filter((r) => r.withMemory.reason.includes("[disagree]"));
	if (disagreements.length > 0) {
		console.log(`\n  ⚠ Judge disagreements: ${disagreements.length}`);
		for (const d of disagreements) {
			console.log(`    ${d.id} "${d.query.slice(0, 30)}..." — ${d.withMemory.reason.slice(0, 80)}`);
		}
	}

	// Save
	const reportDir = join(import.meta.dirname, "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `memory-comprehensive-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		version: "comprehensive-v4",
		pipeline: "MemorySystem(Mem0Adapter)",
		judge: config.judge,
		model: "gemini-2.5-flash",
		core: { total: core.length, withMemory: memPass, noMemory: noMemPass, delta: memPass - noMemPass },
		bonus: { total: bonus.length, withMemory: bonusMemPass },
		grade,
		disagreements: disagreements.length,
		byCapability: byCap,
		details: results,
	}, null, 2));
	console.log(`\n  Report: ${reportPath}`);

	await system.close();
}

main().catch(console.error);
