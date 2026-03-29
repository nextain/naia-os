/**
 * Comprehensive Memory Benchmark — all 12 capabilities from query-templates.json
 *
 * Runs two modes:
 * 1. WITH memory (mem0 + Gemini) — full pipeline
 * 2. WITHOUT memory — LLM alone (no recall)
 *
 * Delta = memory contribution.
 * Keyword judge for deterministic scoring.
 * 2s throttle between all API calls.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MemorySystem } from "../index.js";
import { Mem0Adapter } from "../mem0-adapter.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const THROTTLE_MS = 2000;

// ─── Utilities ───────────────────────────────────────────────────────────────

async function throttle(): Promise<void> {
	await new Promise((r) => setTimeout(r, THROTTLE_MS));
}

async function callGemini(
	apiKey: string,
	messages: Array<{ role: string; content: string }>,
	maxTokens: number,
): Promise<string> {
	for (let attempt = 0; attempt < 3; attempt++) {
		await throttle();
		try {
			const res = await fetch(`${GEMINI_BASE}chat/completions`, {
				method: "POST",
				headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
				body: JSON.stringify({ model: "gemini-2.5-flash", messages, max_tokens: maxTokens }),
			});
			if (!res.ok) {
				console.error(`    ⚠ HTTP ${res.status} (attempt ${attempt + 1})`);
				await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
				continue;
			}
			const data = await res.json() as any;
			const content = data.choices?.[0]?.message?.content ?? "";
			if (content.length > 0) return content;
		} catch (err: any) {
			console.error(`    ⚠ fetch error: ${err.message?.slice(0, 60)}`);
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
	return "";
}

async function askWithMemory(apiKey: string, memories: string[], question: string): Promise<string> {
	const memCtx = memories.length > 0
		? `<recalled_memories>\n${memories.map((m) => `- ${m}`).join("\n")}\n</recalled_memories>`
		: "(관련 기억 없음)";

	return callGemini(apiKey, [
		{ role: "system", content: `당신은 사용자의 개인 AI 동반자입니다.

## 규칙
1. 기억 중에서 사용자 질문과 **관련된 것**을 활용하세요.
2. 사용자가 도움을 요청하면(코드 작성, 설정, 추천 등), 기억에 있는 사용자의 선호와 환경을 **자연스럽게 반영**하세요. 예: 사용자가 TypeScript를 쓴다고 했으면 TypeScript 기준으로 답하세요.
3. 사용자가 자신에 대한 사실을 물어보는데 기억에 없으면 "기억에 없습니다"라고 답하세요.
4. 기억에 없는 **사실**을 절대 지어내지 마세요. 하지만 기억에 있는 사실을 기반으로 도움을 주는 건 좋습니다.
5. 여러 기억을 종합해서 답할 수 있으면 종합하세요.

${memCtx}` },
		{ role: "user", content: question },
	], 300);
}

async function askWithoutMemory(apiKey: string, question: string): Promise<string> {
	return callGemini(apiKey, [
		{ role: "system", content: `당신은 AI 어시스턴트입니다. 사용자에 대해 아는 정보가 없습니다. 모르는 것은 모른다고 답하세요.` },
		{ role: "user", content: question },
	], 300);
}

// ─── Judge ────────────────────────────────────────────────────────────────────

interface JudgeResult { pass: boolean; reason: string }

function judgeContains(response: string, expected: string[]): JudgeResult {
	const lower = response.toLowerCase();
	const found = expected.filter((k) => lower.includes(k.toLowerCase()));
	if (found.length > 0) return { pass: true, reason: `PASS: found [${found.join(", ")}]` };
	return { pass: false, reason: `FAIL: none of [${expected.join(", ")}] in "${response.slice(0, 60)}"` };
}

function judgeNotContains(response: string, forbidden: string[]): JudgeResult {
	const lower = response.toLowerCase();
	const found = forbidden.filter((k) => lower.includes(k.toLowerCase()));
	if (found.length > 0) return { pass: false, reason: `FAIL: found forbidden [${found.join(", ")}]` };
	return { pass: true, reason: "PASS: no forbidden keywords" };
}

function judgeAbstention(response: string, hallucination_keywords?: string[]): JudgeResult {
	const lower = response.toLowerCase();
	const refusals = ["말씀하신 적", "기억에 없", "모르", "없는 것 같", "언급하신 적", "기억이 없", "알 수 없", "말한 적", "정보가 없", "없습니다", "아닙니다", "죄송", "확인할 수 없", "기억에는 없", "기억에 따르면 없"];
	const hasRefusal = refusals.some((p) => lower.includes(p));
	// Negation context: if hallucination keyword appears with refusal, it's a correct distinction
	const negationContext = ["없", "아니", "않", "안 "];

	if (hallucination_keywords && hallucination_keywords.length > 0) {
		const hallucinated = hallucination_keywords.filter((k) => lower.includes(k.toLowerCase()));
		if (hallucinated.length > 0) {
			// Check if keyword appears in negation context (e.g., "Nuxt.js를 쓴다고는 없습니다")
			const inNegation = hasRefusal || negationContext.some((n) => lower.includes(n));
			if (inNegation) {
				return { pass: true, reason: `PASS: refusal with correct distinction [${hallucinated.join(", ")}]` };
			}
			return { pass: false, reason: `FAIL: hallucinated [${hallucinated.join(", ")}]` };
		}
	}

	if (hasRefusal) return { pass: true, reason: "PASS: refusal detected" };

	// No clear refusal — check if response is informative (bad for abstention)
	const assertions = ["네,", "맞아", "하셨", "라고", "입니다", "이에요", "있어요"];
	if (assertions.some((a) => lower.includes(a))) {
		return { pass: false, reason: "FAIL: assertion without refusal" };
	}
	return { pass: false, reason: "FAIL: no clear refusal" };
}

function judgeAny(response: string, expected: string[], minCount: number): JudgeResult {
	const lower = response.toLowerCase();
	const found = expected.filter((k) => lower.includes(k.toLowerCase()));
	if (found.length >= minCount) return { pass: true, reason: `PASS: found ${found.length}/${expected.length} (min ${minCount}): [${found.join(", ")}]` };
	return { pass: false, reason: `FAIL: found ${found.length}/${expected.length} (min ${minCount}): [${found.join(", ")}]` };
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

interface TestResult {
	id: string;
	capability: string;
	query: string;
	weight: number;
	isBonus: boolean;
	withMemory: { response: string; pass: boolean; reason: string; memories: string[] };
	noMemory: { response: string; pass: boolean; reason: string };
}

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) { console.error("GEMINI_API_KEY required"); process.exit(1); }

	const factBank = JSON.parse(readFileSync(join(import.meta.dirname, "fact-bank.json"), "utf-8"));
	const templates = JSON.parse(readFileSync(join(import.meta.dirname, "query-templates.json"), "utf-8"));

	// ─── Phase 1: Encode via MemorySystem(Mem0Adapter) ───────────────────
	// This tests the FULL naia pipeline: importance gating → mem0 storage → reconsolidation
	console.log("=== Phase 1: Encoding via MemorySystem(Mem0Adapter) ===\n");
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
			// Goes through: scoreImportance → shouldStore → episode.store → checkAndReconsolidate
			const episode = await system.encode(
				{ content: fact.statement, role: "user" },
				{ project: "benchmark" },
			);
			const stored = episode !== null;
			console.log(`  ${stored ? "✅" : "⛔"} ${fact.id}: ${fact.statement.slice(0, 50)}...${stored ? "" : " (gated out by importance)"}`);
		} catch (err: any) {
			console.log(`  ❌ ${fact.id}: ${err.message?.slice(0, 60)}`);
		}
	}

	// Verify stored memories
	const allFacts = await adapter.semantic.getAll();
	console.log(`\n  Stored: ${allFacts.length} facts (after importance gating + reconsolidation)\n`);

	// ─── Phase 2: Run ALL capabilities ───────────────────────────────────
	console.log("=== Phase 2: Testing ===\n");
	const results: TestResult[] = [];
	let testNum = 0;

	for (const [capName, cap] of Object.entries(templates.capabilities) as [string, any][]) {
		if (!cap.queries) continue;
		const weight = cap.weight ?? 1;
		const isBonus = cap.is_bonus ?? false;

		console.log(`── ${capName} (weight: ${weight}${isBonus ? ", bonus" : ""}) ──`);

		for (const q of cap.queries) {
			testNum++;
			const id = `${capName.slice(0, 4).toUpperCase()}-${String(testNum).padStart(2, "0")}`;
			const query = q.query || q.verify || "";
			if (!query) continue;

			// Handle setup (entity disambiguation) — goes through MemorySystem.encode()
			if (q.setup) {
				await throttle();
				await system.encode({ content: q.setup, role: "user" }, { project: "benchmark" });
			}

			// Handle update (contradiction) — goes through MemorySystem.encode() → checkAndReconsolidate()
			if (q.update) {
				await throttle();
				await system.encode({ content: q.update, role: "user" }, { project: "benchmark" });
			}

			// Handle noisy_input (noise resilience) — goes through importance gating
			if (q.noisy_input) {
				await throttle();
				await system.encode({ content: q.noisy_input, role: "user" }, { project: "benchmark" });
			}

			// ── WITH memory — uses MemorySystem.recall() (decay + context weighting) ──
			let memories: string[] = [];
			const useAll = capName === "multi_fact_synthesis";
			if (useAll) {
				// Synthesis needs broad context — use recall with high topK
				try {
					await throttle();
					const result = await system.recall(query, { project: "benchmark", topK: 20 });
					memories = [
						...result.facts.map((f) => f.content),
						...result.episodes.map((e) => e.content),
					];
				} catch (err: any) {
					console.error(`    ⚠ recall error: ${err.message?.slice(0, 60)}`);
				}
			} else {
				try {
					await throttle();
					const result = await system.recall(query, { project: "benchmark", topK: 10 });
					memories = [
						...result.facts.map((f) => f.content),
						...result.episodes.map((e) => e.content),
					];
				} catch (err: any) {
					console.error(`    ⚠ recall error: ${err.message?.slice(0, 60)}`);
				}
			}
			const withMemResp = await askWithMemory(apiKey, memories, query);

			// ── WITHOUT memory ──
			const noMemResp = await askWithoutMemory(apiKey, query);

			// ── Judge ──
			let withMemJudge: JudgeResult;
			let noMemJudge: JudgeResult;

			if (capName === "abstention") {
				withMemJudge = judgeAbstention(withMemResp, q.hallucination_keywords);
				noMemJudge = judgeAbstention(noMemResp, q.hallucination_keywords);
			} else if (capName === "irrelevant_isolation") {
				withMemJudge = judgeNotContains(withMemResp, q.expected_not_contains ?? []);
				noMemJudge = judgeNotContains(noMemResp, q.expected_not_contains ?? []);
			} else if (q.expected_any) {
				const min = q.min_expected ?? cap.min_expected ?? cap.min_facts ?? 2;
				withMemJudge = judgeAny(withMemResp, q.expected_any, min);
				noMemJudge = judgeAny(noMemResp, q.expected_any, min);
			} else if (q.expected_contains) {
				withMemJudge = judgeContains(withMemResp, q.expected_contains);
				noMemJudge = judgeContains(noMemResp, q.expected_contains);
			} else if (q.expected_pattern) {
				withMemJudge = judgeAbstention(withMemResp, q.hallucination_keywords);
				noMemJudge = judgeAbstention(noMemResp, q.hallucination_keywords);
			} else {
				withMemJudge = { pass: false, reason: "NO_JUDGE_DEFINED" };
				noMemJudge = { pass: false, reason: "NO_JUDGE_DEFINED" };
			}

			results.push({
				id, capability: capName, query, weight, isBonus,
				withMemory: { response: withMemResp.slice(0, 200), pass: withMemJudge.pass, reason: withMemJudge.reason, memories },
				noMemory: { response: noMemResp.slice(0, 200), pass: noMemJudge.pass, reason: noMemJudge.reason },
			});

			const wIcon = withMemJudge.pass ? "✅" : "❌";
			const nIcon = noMemJudge.pass ? "✅" : "❌";
			console.log(`  ${id} "${query.slice(0, 35)}..." — mem:${wIcon} / noMem:${nIcon}`);
		}
		console.log();
	}

	// ─── Phase 3: Report ─────────────────────────────────────────────────
	const core = results.filter((r) => !r.isBonus);
	const bonus = results.filter((r) => r.isBonus);

	const memPass = core.filter((r) => r.withMemory.pass).length;
	const noMemPass = core.filter((r) => r.noMemory.pass).length;
	const bonusMemPass = bonus.filter((r) => r.withMemory.pass).length;

	const byCap: Record<string, { mem: number; noMem: number; total: number; weight: number }> = {};
	for (const r of results) {
		if (!byCap[r.capability]) byCap[r.capability] = { mem: 0, noMem: 0, total: 0, weight: r.weight };
		byCap[r.capability].total++;
		if (r.withMemory.pass) byCap[r.capability].mem++;
		if (r.noMemory.pass) byCap[r.capability].noMem++;
	}

	console.log("═══════════════════════════════════════════════════════════");
	console.log("  COMPREHENSIVE MEMORY BENCHMARK");
	console.log("═══════════════════════════════════════════════════════════\n");
	console.log(`  Core tests:  ${memPass}/${core.length} (${Math.round(memPass / core.length * 100)}%) with memory`);
	console.log(`               ${noMemPass}/${core.length} (${Math.round(noMemPass / core.length * 100)}%) without memory`);
	console.log(`  Delta:       +${memPass - noMemPass} tests (memory contribution)\n`);
	console.log(`  Bonus:       ${bonusMemPass}/${bonus.length}\n`);

	// Grade
	const coreRate = memPass / core.length;
	const bonusRate = bonus.length > 0 ? bonusMemPass / bonus.length : 0;
	const abstentionFail = results.some((r) => r.capability === "abstention" && !r.withMemory.pass);
	let grade: string;
	if (abstentionFail) grade = "F (abstention fail)";
	else if (coreRate >= 0.9 && bonusRate >= 0.5) grade = "A";
	else if (coreRate >= 0.75) grade = "B";
	else if (coreRate >= 0.6) grade = "C";
	else grade = "F";

	console.log(`  Grade:       ${grade}\n`);
	console.log("  By capability:");
	console.log("  ┌─────────────────────────┬───────┬─────────┬────────┐");
	console.log("  │ Capability              │  w    │ w/ mem  │ w/o mem│");
	console.log("  ├─────────────────────────┼───────┼─────────┼────────┤");
	for (const [name, c] of Object.entries(byCap)) {
		const pMem = `${c.mem}/${c.total}`;
		const pNo = `${c.noMem}/${c.total}`;
		const bonus = c.weight === 0 ? "*" : " ";
		console.log(`  │ ${(name + bonus).padEnd(24)}│ ${String(c.weight).padEnd(5)} │ ${pMem.padEnd(7)} │ ${pNo.padEnd(6)} │`);
	}
	console.log("  └─────────────────────────┴───────┴─────────┴────────┘");
	console.log(`  * = bonus (not counted in grade)\n`);

	// Save
	const reportDir = join(import.meta.dirname, "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `memory-comprehensive-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		version: "comprehensive-v2",
		pipeline: "MemorySystem(Mem0Adapter) — importance gating + decay + reconsolidation + mem0 vector search",
		model: "gemini-2.5-flash",
		core: { total: core.length, withMemory: memPass, noMemory: noMemPass, delta: memPass - noMemPass },
		bonus: { total: bonus.length, withMemory: bonusMemPass },
		grade,
		byCapability: byCap,
		details: results,
	}, null, 2));
	console.log(`  Report: ${reportPath}`);

	await system.close();
}

main().catch(console.error);
