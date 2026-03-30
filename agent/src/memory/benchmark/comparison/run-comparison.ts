import { execSync } from "node:child_process";
/**
 * Memory System Comparison Benchmark
 *
 * Runs the same 55 tests (fact-bank.json + query-templates.json) against
 * multiple memory systems and produces a side-by-side comparison.
 *
 * Usage:
 *   pnpm exec tsx src/memory/benchmark/comparison/run-comparison.ts [options]
 *
 * Options:
 *   --adapters=naia,mem0,openclaw,letta,zep   (default: naia,mem0)
 *   --judge=claude-cli|keyword                (default: claude-cli)
 *   --runs=N                                  (runs per test, default: 1)
 *   --skip-encode                             (skip encoding, assume already done)
 *   --categories=recall,abstention,...         (filter categories)
 *
 * Requires: GEMINI_API_KEY env var
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JikimeAdkAdapter } from "./adapter-jikime-adk.js";
import { JikimeMemAdapter } from "./adapter-jikime-mem.js";
import { LettaAdapter } from "./adapter-letta.js";
import { Mem0Adapter } from "./adapter-mem0.js";
import { NaiaAdapter } from "./adapter-naia.js";
import { NoMemoryAdapter } from "./adapter-no-memory.js";
import { OpenClawAdapter } from "./adapter-openclaw.js";
import { SapAdapter } from "./adapter-sap.js";
import { ZepAdapter } from "./adapter-zep.js";
import type {
	BenchmarkAdapter,
	ComparisonResult,
	TestDetail,
} from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const THROTTLE_MS = 2000;

// ─── CLI Args ────────────────────────────────────────────────────────────────

function parseArgs() {
	const args = process.argv.slice(2);
	let adapterNames = ["naia", "mem0"];
	let judge: "claude-cli" | "keyword" = "claude-cli";
	let runs = 1;
	let categories: string[] | null = null;

	for (const arg of args) {
		if (arg.startsWith("--adapters="))
			adapterNames = arg.split("=")[1].split(",");
		if (arg.startsWith("--judge=")) judge = arg.split("=")[1] as any;
		if (arg.startsWith("--runs="))
			runs = Number.parseInt(arg.split("=")[1], 10);
		if (arg.startsWith("--categories="))
			categories = arg.split("=")[1].split(",");
	}
	return { adapterNames, judge, runs, categories };
}

// ─── Adapter Factory ────────────────────────────────────────────────────────

function createAdapter(name: string, apiKey: string): BenchmarkAdapter {
	switch (name) {
		case "naia":
			return new NaiaAdapter(apiKey);
		case "mem0":
			return new Mem0Adapter(apiKey);
		case "openclaw":
			return new OpenClawAdapter();
		case "letta":
			return new LettaAdapter();
		case "zep":
			return new ZepAdapter();
		case "jikime-mem":
			return new JikimeMemAdapter();
		case "sap":
			return new SapAdapter(apiKey);
		case "jikime-adk":
			return new JikimeAdkAdapter();
		case "airi":
			return new NoMemoryAdapter(
				"airi",
				"project-airi — memory WIP (stub), no search",
			);
		case "open-llm-vtuber":
			return new NoMemoryAdapter(
				"open-llm-vtuber",
				"Open-LLM-VTuber — chat history only, no persistent memory",
			);
		default:
			throw new Error(`Unknown adapter: ${name}`);
	}
}

// ─── LLM Response Generation ────────────────────────────────────────────────

async function callGemini(
	apiKey: string,
	messages: Array<{ role: string; content: string }>,
	maxTokens: number,
): Promise<string> {
	for (let attempt = 0; attempt < 3; attempt++) {
		await new Promise((r) => setTimeout(r, THROTTLE_MS));
		try {
			const res = await fetch(`${GEMINI_BASE}chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "gemini-2.5-flash",
					messages,
					max_tokens: maxTokens,
				}),
			});
			if (!res.ok) {
				await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
				continue;
			}
			const data = (await res.json()) as any;
			const content = data.choices?.[0]?.message?.content ?? "";
			if (content.length > 0) return content;
		} catch {}
	}
	return "";
}

function callClaudeCli(prompt: string): string {
	try {
		return execSync("claude -p 2>/dev/null", {
			input: prompt,
			timeout: 60000,
			encoding: "utf-8",
		}).trim();
	} catch {
		return "";
	}
}

async function askWithMemory(
	apiKey: string,
	memories: string[],
	question: string,
): Promise<string> {
	const memCtx =
		memories.length > 0
			? `<recalled_memories>\n${memories.map((m) => `- ${m}`).join("\n")}\n</recalled_memories>`
			: "(관련 기억 없음)";

	return callGemini(
		apiKey,
		[
			{
				role: "system",
				content: `당신은 사용자의 개인 AI 동반자입니다.

## 규칙
1. 기억 중에서 사용자 질문과 **관련된 것**을 활용하세요.
2. 사용자가 도움을 요청하면, **되묻지 말고** 기억에 있는 선호와 환경을 **즉시 반영하여 실행**하세요.
3. 사용자가 자신에 대한 사실을 물어보는데 기억에 없으면 "기억에 없습니다"라고 답하세요.
4. 기억에 없는 **사실**을 절대 지어내지 마세요.
5. 여러 기억을 종합해서 답할 수 있으면 종합하세요.

${memCtx}`,
			},
			{ role: "user", content: question },
		],
		500,
	);
}

// ─── Judge ───────────────────────────────────────────────────────────────────

interface JudgeResult {
	pass: boolean;
	reason: string;
}

function buildJudgePrompt(q: any, capName: string, response: string): string {
	if (capName === "abstention") {
		return `[채점] abstention (환각 방지)
질문: "${q.query || q.verify}"
AI 응답: "${response}"
이 질문은 사용자가 말한 적 없는 것에 대한 질문입니다. AI는 "기억에 없다/모르겠다"고 거절해야 합니다.
- 거절했으면 → PASS
- 없는 정보를 지어냈으면 → FAIL
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (capName === "irrelevant_isolation") {
		const forbidden = (q.expected_not_contains ?? []).join(", ");
		return `[채점] irrelevant_isolation
질문: "${q.query}"
AI 응답: "${response}"
포함되면 안 되는 키워드: [${forbidden}]
일반 질문에 불필요하게 사용자 개인정보를 끼워넣으면 FAIL.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		return `[채점] ${capName}
질문: "${q.query || q.verify}"
AI 응답: "${response}"
기대 키워드 중 ${min}개 이상: [${q.expected_any.join(", ")}]
AI 응답이 위 키워드 중 ${min}개 이상을 의미적으로 포함하면 PASS.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (q.expected_contains) {
		return `[채점] ${capName}
질문: "${q.query || q.verify}"
AI 응답: "${response}"
기대 키워드: [${q.expected_contains.join(", ")}]
${q.expected_not_contains?.length ? `금지 키워드: [${q.expected_not_contains.join(", ")}]` : ""}
${q.fail_signal?.length ? `FAIL 신호: [${q.fail_signal.join(", ")}]` : ""}
기대 키워드 중 하나라도 의미적으로 포함하면 PASS.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	return `[채점] ${capName}
질문: "${q.query || q.verify}"
AI 응답: "${response}"
적절히 답했으면 PASS, 아니면 FAIL.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
}

function parseVerdict(raw: string): JudgeResult {
	const first = raw.split("\n")[0].trim().toUpperCase();
	const pass = first === "PASS" || first.startsWith("PASS");
	return { pass, reason: raw.slice(0, 120) || "EMPTY" };
}

function keywordJudge(response: string, q: any, capName: string): JudgeResult {
	const lower = response.toLowerCase();
	if (capName === "abstention") {
		const refusals = [
			"말씀하신 적",
			"기억에 없",
			"모르",
			"없는 것 같",
			"언급하신 적",
			"기억이 없",
			"알 수 없",
			"말한 적",
			"정보가 없",
			"없습니다",
			"아닙니다",
			"죄송",
		];
		return refusals.some((p) => lower.includes(p))
			? { pass: true, reason: "PASS(kw): refusal" }
			: { pass: false, reason: "FAIL(kw): no refusal" };
	}
	if (capName === "irrelevant_isolation") {
		const found = (q.expected_not_contains ?? []).filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		return found.length > 0
			? { pass: false, reason: `FAIL(kw): forbidden [${found}]` }
			: { pass: true, reason: "PASS(kw)" };
	}
	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		const found = q.expected_any.filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		return found.length >= min
			? { pass: true, reason: `PASS(kw): [${found}]` }
			: {
					pass: false,
					reason: `FAIL(kw): ${found.length}/${q.expected_any.length}`,
				};
	}
	if (q.expected_contains) {
		const found = q.expected_contains.filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		return found.length > 0
			? { pass: true, reason: `PASS(kw): [${found}]` }
			: { pass: false, reason: "FAIL(kw): none found" };
	}
	return { pass: false, reason: "NO_JUDGE" };
}

async function judgeResponse(
	apiKey: string,
	mode: string,
	q: any,
	capName: string,
	response: string,
): Promise<JudgeResult> {
	if (mode === "keyword") return keywordJudge(response, q, capName);

	// claude-cli batch judge
	const prompt = buildJudgePrompt(q, capName, response);
	const raw = callClaudeCli(prompt);
	if (!raw) return keywordJudge(response, q, capName); // fallback
	return parseVerdict(raw);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("GEMINI_API_KEY required");
		process.exit(1);
	}

	const config = parseArgs();
	console.log("\n╔══════════════════════════════════════════════════════════╗");
	console.log("║  MEMORY SYSTEM COMPARISON BENCHMARK                     ║");
	console.log(`║  Adapters: ${config.adapterNames.join(", ").padEnd(44)}║`);
	console.log(`║  Judge: ${config.judge.padEnd(47)}║`);
	console.log(`║  Runs: ${String(config.runs).padEnd(48)}║`);
	console.log("╚══════════════════════════════════════════════════════════╝\n");

	const factBankPath = join(import.meta.dirname, "..", "fact-bank.json");
	const templatesPath = join(import.meta.dirname, "..", "query-templates.json");
	const factBank = JSON.parse(readFileSync(factBankPath, "utf-8"));
	const templates = JSON.parse(readFileSync(templatesPath, "utf-8"));

	const allResults: ComparisonResult[] = [];

	for (const adapterName of config.adapterNames) {
		console.log(`\n${"═".repeat(60)}`);
		console.log(`  TESTING: ${adapterName}`);
		console.log(`${"═".repeat(60)}\n`);

		let adapter: BenchmarkAdapter;
		try {
			adapter = createAdapter(adapterName, apiKey);
		} catch (err: any) {
			console.error(`  ❌ Failed to create adapter: ${err.message}`);
			continue;
		}

		try {
			// Phase 1: Init + Encode
			console.log("  Phase 1: Init + Encode\n");
			await adapter.init();

			let stored = 0;
			let gated = 0;
			for (const fact of factBank.facts) {
				try {
					const ok = await adapter.addFact(fact.statement);
					if (ok) {
						stored++;
						console.log(`    ✅ ${fact.id}: ${fact.statement.slice(0, 50)}...`);
					} else {
						gated++;
						console.log(`    ⛔ ${fact.id}: GATED`);
					}
				} catch (err: any) {
					console.log(`    ❌ ${fact.id}: ${err.message?.slice(0, 60)}`);
				}
			}
			console.log(
				`\n    Stored: ${stored}/${factBank.facts.length} (gated: ${gated})\n`,
			);

			// Phase 2: Query + Respond + Judge
			console.log("  Phase 2: Query + Judge\n");
			const details: TestDetail[] = [];
			let testNum = 0;

			// Explicit execution order — do NOT rely on JSON key order.
			// Pre-update tests first, then contradiction (which mutates), then post-update tests.
			const CAPABILITY_ORDER = [
				"direct_recall",
				"semantic_search",
				"proactive_recall",
				"abstention",
				"irrelevant_isolation",
				"multi_fact_synthesis",
				"entity_disambiguation",
				"noise_resilience",
				// === Mutation boundary: updates happen below ===
				"contradiction_direct",
				"contradiction_indirect",
				// === Post-mutation tests ===
				"unchanged_persistence",
				"temporal_history",
			];
			const capEntries = CAPABILITY_ORDER.filter(
				(name) => templates.capabilities[name],
			).map((name) => [name, templates.capabilities[name]] as [string, any]);

			for (const [capName, cap] of capEntries) {
				if (!cap.queries) continue;
				if (config.categories && !config.categories.includes(capName)) continue;

				const weight = cap.weight ?? 1;
				const isBonus = cap.is_bonus ?? false;
				console.log(
					`    ── ${capName} (w:${weight}${isBonus ? " bonus" : ""}) ──`,
				);

				for (const q of cap.queries) {
					testNum++;
					const id = `${capName.slice(0, 4).toUpperCase()}-${String(testNum).padStart(2, "0")}`;
					const query = q.query || q.verify || "";
					if (!query) continue;

					// Handle setup/update/noise — log failures + wait for indexing
					if (q.setup)
						try {
							await adapter.addFact(q.setup);
							await new Promise((r) => setTimeout(r, THROTTLE_MS));
						} catch (e: any) {
							console.error(`      ⚠ setup fail: ${e.message?.slice(0, 60)}`);
						}
					if (q.update)
						try {
							await adapter.addFact(q.update);
							await new Promise((r) => setTimeout(r, THROTTLE_MS));
						} catch (e: any) {
							console.error(`      ⚠ update fail: ${e.message?.slice(0, 60)}`);
						}
					if (q.noisy_input)
						try {
							await adapter.addFact(q.noisy_input);
							await new Promise((r) => setTimeout(r, THROTTLE_MS));
						} catch (e: any) {
							console.error(`      ⚠ noise fail: ${e.message?.slice(0, 60)}`);
						}

					// Search memories
					let memories: string[] = [];
					try {
						memories = await adapter.search(query, 10);
					} catch (err: any) {
						console.error(`      ⚠ search: ${err.message?.slice(0, 60)}`);
					}

					// Generate response with memories + Judge (multiple runs, majority vote)
					let passCount = 0;
					let lastResponse = "";
					let lastReason = "";

					for (let run = 0; run < config.runs; run++) {
						const response = await askWithMemory(apiKey, memories, query);
						lastResponse = response;
						const verdict = await judgeResponse(
							apiKey,
							config.judge,
							q,
							capName,
							response,
						);
						lastReason = verdict.reason;
						if (verdict.pass) passCount++;
					}

					const pass = passCount >= Math.ceil(config.runs / 2);
					const reason =
						config.runs > 1
							? `${passCount}/${config.runs} → ${pass ? "PASS" : "FAIL"} | ${lastReason.slice(0, 60)}`
							: lastReason;

					details.push({
						id,
						capability: capName,
						query,
						weight,
						isBonus,
						pass,
						reason,
						memories,
						response: lastResponse.slice(0, 400),
					});
					console.log(
						`      ${pass ? "✅" : "❌"} ${id} "${query.slice(0, 30)}..." [${memories.length} mem] ${reason.slice(0, 50)}`,
					);
				}
				console.log();
			}

			// Phase 3: Score
			const core = details.filter((d) => !d.isBonus);
			const bonus = details.filter((d) => d.isBonus);
			const corePassed = core.filter((d) => d.pass).length;
			const bonusPassed = bonus.filter((d) => d.pass).length;
			const coreRate = core.length > 0 ? corePassed / core.length : 0;
			const bonusRate = bonus.length > 0 ? bonusPassed / bonus.length : 0;
			const abstentionFail = details.some(
				(d) => d.capability === "abstention" && !d.pass,
			);

			let grade: string;
			if (abstentionFail) grade = "F (abstention fail)";
			else if (coreRate >= 0.9 && (bonus.length === 0 || bonusRate >= 0.5))
				grade = "A";
			else if (coreRate >= 0.75) grade = "B";
			else if (coreRate >= 0.6) grade = "C";
			else grade = "F";

			const byCapability: ComparisonResult["byCapability"] = {};
			for (const d of details) {
				if (!byCapability[d.capability])
					byCapability[d.capability] = {
						passed: 0,
						total: 0,
						weight: d.weight,
					};
				byCapability[d.capability].total++;
				if (d.pass) byCapability[d.capability].passed++;
			}

			allResults.push({
				adapter: adapter.name,
				description: adapter.description,
				core: { total: core.length, passed: corePassed, rate: coreRate },
				bonus: { total: bonus.length, passed: bonusPassed },
				grade,
				byCapability,
				details,
			});

			console.log(`    ─── ${adapter.name} Result ───`);
			console.log(
				`    Core: ${corePassed}/${core.length} (${Math.round(coreRate * 100)}%)`,
			);
			console.log(`    Bonus: ${bonusPassed}/${bonus.length}`);
			console.log(`    Grade: ${grade}\n`);
		} catch (err: any) {
			console.error(`  ❌ ${adapterName} failed: ${err.message}`);
			allResults.push({
				adapter: adapterName,
				description: `ERROR: ${err.message}`,
				core: { total: 0, passed: 0, rate: 0 },
				bonus: { total: 0, passed: 0 },
				grade: "ERROR",
				byCapability: {},
				details: [],
			});
		} finally {
			try {
				await adapter?.cleanup();
			} catch {}
		}
	}

	// ─── Final Comparison Report ─────────────────────────────────────────
	console.log(`\n${"═".repeat(70)}`);
	console.log("  COMPARISON SUMMARY");
	console.log(`${"═".repeat(70)}\n`);

	// Header
	const names = allResults.map((r) => r.adapter);
	console.log(
		`  ${"Category".padEnd(25)} ${names.map((n) => n.padStart(10)).join(" ")}`,
	);
	console.log(
		`  ${"─".repeat(25)} ${names.map(() => "─".repeat(10)).join(" ")}`,
	);

	// Collect all capability names
	const allCaps = new Set<string>();
	for (const r of allResults)
		for (const cap of Object.keys(r.byCapability)) allCaps.add(cap);

	for (const cap of allCaps) {
		const cells = allResults.map((r) => {
			const c = r.byCapability[cap];
			return c ? `${c.passed}/${c.total}` : "-";
		});
		console.log(
			`  ${cap.padEnd(25)} ${cells.map((c) => c.padStart(10)).join(" ")}`,
		);
	}

	console.log(
		`  ${"─".repeat(25)} ${names.map(() => "─".repeat(10)).join(" ")}`,
	);
	console.log(
		`  ${"CORE TOTAL".padEnd(25)} ${allResults.map((r) => `${r.core.passed}/${r.core.total}`.padStart(10)).join(" ")}`,
	);
	console.log(
		`  ${"CORE %".padEnd(25)} ${allResults.map((r) => `${Math.round(r.core.rate * 100)}%`.padStart(10)).join(" ")}`,
	);
	console.log(
		`  ${"GRADE".padEnd(25)} ${allResults.map((r) => r.grade.padStart(10)).join(" ")}`,
	);

	// Save report
	const reportDir = join(import.meta.dirname, "../../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(
		reportDir,
		`memory-comparison-${new Date().toISOString().slice(0, 10)}.json`,
	);
	writeFileSync(
		reportPath,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				version: "comparison-v1",
				judge: config.judge,
				runs: config.runs,
				model: "gemini-2.5-flash",
				results: allResults,
			},
			null,
			2,
		),
	);
	console.log(`\n  Report: ${reportPath}\n`);
}

main().catch(console.error);
