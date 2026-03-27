/**
 * Benchmark v2 Multi-Model — Compare memory quality across LLM providers.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx run-v2-multi.ts              # all models
 *   GEMINI_API_KEY=xxx npx tsx run-v2-multi.ts gemini        # gemini only
 *   npx tsx run-v2-multi.ts ollama                           # ollama only (no API key needed)
 *
 * Models tested:
 *   - gemini-2.5-flash (cloud, Gemini API)
 *   - qwen3:8b (local, Ollama) — MiniCPM 4.5 LLM급 성능 기준
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

interface ModelConfig {
	name: string;
	llm: { provider: string; config: Record<string, any> };
	embedder: { provider: string; config: Record<string, any> };
	dimension: number;
}

interface TestCase {
	id: string;
	query: string;
	expected_answer: string;
	category: string;
}

const RUNS = 3;
const PASS_THRESHOLD = 2;

function getModelConfigs(apiKey?: string): ModelConfig[] {
	const configs: ModelConfig[] = [];

	if (apiKey) {
		configs.push({
			name: "gemini-2.5-flash",
			llm: { provider: "openai", config: { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-2.5-flash" } },
			embedder: { provider: "openai", config: { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-embedding-001" } },
			dimension: 3072,
		});
	}

	// Ollama qwen3:8b — mem0 인코딩은 Gemini(LLM+임베딩), LLM 응답+판정만 ollama
	// mem0 ollama 클라이언트 호환성 문제로 인코딩에 Gemini 사용
	// 이 구성은 "같은 기억 DB에서, 다른 LLM이 얼마나 잘 활용하는가"를 비교
	if (apiKey) {
		configs.push({
			name: "qwen3:8b (ollama, 응답만)",
			llm: { provider: "ollama", config: { model: "qwen3:8b" } },
			// mem0 인코딩용 (LLM+임베딩 모두 Gemini) — ollama LLM 호환 문제 우회
			embedder: { provider: "openai", config: { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-embedding-001" } },
			dimension: 3072,
			// mem0 add()에서 팩트 추출 시 Gemini LLM 사용 (ollama 404 우회)
		} as any);
	}

	// 순수 로컬 (API 키 불필요) — mem0 ollama 호환성 문제로 현재 blocked
	// TODO: mem0 ollama 클라이언트 버전 호환성 해결 후 활성화
	// configs.push({
	//   name: "qwen3:8b + qwen3-embedding (full local)",
	//   llm: { provider: "ollama", config: { model: "qwen3:8b" } },
	//   embedder: { provider: "ollama", config: { model: "qwen3-embedding" } },
	//   dimension: 4096,
	// });

	return configs;
}

// Load test cases from JSON file (50 tests, 5 categories × 10)
const TEST_CASES: TestCase[] = JSON.parse(
	readFileSync(join(import.meta.dirname, "test-cases-v3.json"), "utf-8"),
);

async function askLLM(config: ModelConfig, systemPrompt: string, userMessage: string): Promise<string> {
	if (config.llm.provider === "ollama") {
		const res = await fetch("http://localhost:11434/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: config.llm.config.model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userMessage },
				],
				stream: false,
			}),
		});
		const data = await res.json() as any;
		return data.message?.content ?? "";
	}

	// OpenAI-compatible (Gemini)
	const res = await fetch(`${config.llm.config.baseURL}chat/completions`, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${config.llm.config.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: config.llm.config.model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userMessage },
			],
			max_tokens: 8192,
		}),
	});
	const data = await res.json() as any;
	return data.choices?.[0]?.message?.content ?? "";
}

/** Fixed judge model — always the same, independent of the response model.
 *  Prevents self-judge bias. Uses a STRONGER model than any test subject.
 *  gemini-2.5-pro > gemini-2.5-flash > qwen3:8b */
const JUDGE_CONFIG: ModelConfig = {
	name: "judge (gemini-2.5-pro)",
	llm: { provider: "openai", config: {
		apiKey: process.env.GEMINI_API_KEY ?? "",
		baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
		model: "gemini-2.5-pro",
	}},
	embedder: { provider: "openai", config: {} }, // unused for judging
	dimension: 0, // unused
};

function buildJudgePrompt(question: string, response: string, expected: string): string {
	const isAbstention = expected === "NONE";
	return isAbstention
		? `질문: "${question}"
AI 응답: "${response}"
AI가 "모른다/말한 적 없다/기억에 없다"고 올바르게 답했으면 PASS, 없는 정보를 지어냈으면 FAIL.
한 단어로만: PASS 또는 FAIL`
		: `질문: "${question}"
AI 응답: "${response}"
기대 정답: "${expected}"
AI 응답이 기대 정답과 의미적으로 일치하면 PASS. 표현이 달라도 같은 뜻이면 PASS.
한 단어로만: PASS 또는 FAIL`;
}

/** Judge with Gemini 2.5 Pro (API) */
async function judgeGeminiPro(question: string, response: string, expected: string): Promise<boolean> {
	const prompt = buildJudgePrompt(question, response, expected);
	const verdict = await askLLM(JUDGE_CONFIG, "You are a strict judge. Answer only PASS or FAIL.", prompt);
	return verdict.trim().toUpperCase().includes("PASS");
}

/** Judge with Claude CLI (headless, strongest available) */
function judgeClaude(question: string, response: string, expected: string): boolean {
	const prompt = buildJudgePrompt(question, response, expected);
	try {
		const verdict = execSync(
			`echo ${JSON.stringify(prompt)} | claude --print --model sonnet`,
			{ encoding: "utf-8", timeout: 30000 },
		).trim();
		return verdict.toUpperCase().includes("PASS");
	} catch {
		return false;
	}
}

/** Dual judge — gemini-2.5-pro + Claude CLI, 각각 독립 점수 기록 */
async function judgeLLM(_config: ModelConfig, question: string, response: string, expected: string): Promise<{ geminiPass: boolean; claudePass: boolean }> {
	const geminiPass = await judgeGeminiPro(question, response, expected);
	const claudePass = judgeClaude(question, response, expected);
	if (geminiPass !== claudePass) {
		console.log(`    ⚖️ disagreement: pro=${geminiPass ? "P" : "F"} claude=${claudePass ? "P" : "F"}`);
	}
	return { geminiPass, claudePass };
}

/** Shared mem0 instance — encode once with Gemini, test with different LLMs */
let sharedMem0: any = null;
let sharedMem0Encoded = false;

async function ensureSharedMem0(apiKey: string) {
	if (sharedMem0) return sharedMem0;

	const { Memory } = await import("mem0ai/oss");
	const dbPath = `/tmp/mem0-v2m-shared-${Date.now()}`;

	// Always use Gemini for encoding (ollama mem0 client has compatibility issues)
	sharedMem0 = new Memory({
		embedder: { provider: "openai", config: { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-embedding-001" } },
		vectorStore: { provider: "memory", config: { collectionName: "v2m-shared", dimension: 3072, dbPath: `${dbPath}-vec.db` } },
		llm: { provider: "openai", config: { apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-2.5-flash" } },
		historyDbPath: `${dbPath}-hist.db`,
	});

	if (!sharedMem0Encoded) {
		const factBank = JSON.parse(readFileSync(join(import.meta.dirname, "fact-bank.json"), "utf-8"));
		console.log("Encoding facts (Gemini, shared across all models)...");
		for (const fact of factBank.facts) {
			try {
				await sharedMem0.add([{ role: "user", content: fact.statement }], { userId: "v2m" });
				console.log(`  ✅ ${fact.id}`);
			} catch (err: any) {
				console.log(`  ❌ ${fact.id}: ${err.message?.slice(0, 40)}`);
			}
		}
		for (const u of factBank.updates || []) {
			try {
				await sharedMem0.add([{ role: "user", content: u.statement }], { userId: "v2m" });
			} catch {}
		}
		sharedMem0Encoded = true;
		console.log("  Encoding done.\n");
	}

	return sharedMem0;
}

async function runForModel(config: ModelConfig) {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`MODEL: ${config.name}`);
	console.log(`${"=".repeat(60)}\n`);

	const apiKey = config.embedder.config.apiKey || config.llm.config.apiKey || process.env.GEMINI_API_KEY!;
	const m = await ensureSharedMem0(apiKey);

	const factBank = JSON.parse(readFileSync(join(import.meta.dirname, "fact-bank.json"), "utf-8"));
	const startEncode = Date.now();
	const encodeTime = Date.now() - startEncode;
	console.log(`  Encoding: ${(encodeTime / 1000).toFixed(1)}s\n`);

	// Run tests — track both judges independently
	const startTest = Date.now();
	const results: Array<{
		id: string; category: string;
		geminiPassCount: number; claudePassCount: number;
		geminiPass: boolean; claudePass: boolean;
	}> = [];

	for (const tc of TEST_CASES) {
		let geminiPC = 0, claudePC = 0;
		for (let run = 0; run < RUNS; run++) {
			let memories: string[] = [];
			try {
				const raw = await m.search(tc.query, { userId: "v2m", limit: 5 });
				memories = (raw?.results ?? raw ?? []).map((r: any) => r.memory ?? r.text ?? "");
			} catch {}

			const memCtx = memories.length > 0
				? `<recalled_memories>\n${memories.map((m2) => `- ${m2}`).join("\n")}\n</recalled_memories>`
				: "(관련 기억 없음)";

			const sysPrompt = `당신은 사용자의 개인 AI입니다. 기억:\n${memCtx}\n기억에 있는 것만 답하세요. 없으면 "기억에 없습니다"라고 하세요. 지어내지 마세요.`;
			const response = await askLLM(config, sysPrompt, tc.query);
			const { geminiPass: gp, claudePass: cp } = await judgeLLM(config, tc.query, response, tc.expected_answer);
			if (gp) geminiPC++;
			if (cp) claudePC++;
		}

		const gFinal = geminiPC >= PASS_THRESHOLD;
		const cFinal = claudePC >= PASS_THRESHOLD;
		results.push({ id: tc.id, category: tc.category, geminiPassCount: geminiPC, claudePassCount: claudePC, geminiPass: gFinal, claudePass: cFinal });

		const gIcon = gFinal ? "✅" : "❌";
		const cIcon = cFinal ? "✅" : "❌";
		console.log(`  pro:${gIcon} claude:${cIcon} [${tc.category}] ${tc.id} "${tc.query.slice(0, 30)}..." (pro:${geminiPC}/${RUNS} claude:${claudePC}/${RUNS})`);
	}

	const testTime = Date.now() - startTest;

	// Separate scores for each judge
	const geminiTotal = results.filter((r) => r.geminiPass).length;
	const claudeTotal = results.filter((r) => r.claudePass).length;
	const geminiRate = Math.round((geminiTotal / results.length) * 100);
	const claudeRate = Math.round((claudeTotal / results.length) * 100);

	const byCategoryGemini: Record<string, { pass: number; total: number }> = {};
	const byCategoryClaude: Record<string, { pass: number; total: number }> = {};
	for (const r of results) {
		if (!byCategoryGemini[r.category]) byCategoryGemini[r.category] = { pass: 0, total: 0 };
		if (!byCategoryClaude[r.category]) byCategoryClaude[r.category] = { pass: 0, total: 0 };
		byCategoryGemini[r.category].total++;
		byCategoryClaude[r.category].total++;
		if (r.geminiPass) byCategoryGemini[r.category].pass++;
		if (r.claudePass) byCategoryClaude[r.category].pass++;
	}

	console.log(`\n  gemini-2.5-pro judge: ${geminiTotal}/${results.length} (${geminiRate}%)`);
	console.log(`  Claude judge:         ${claudeTotal}/${results.length} (${claudeRate}%)`);
	console.log(`  Test time: ${(testTime / 1000).toFixed(1)}s`);
	console.log("\n  By category (pro / claude):");
	for (const cat of Object.keys(byCategoryGemini)) {
		const g = byCategoryGemini[cat];
		const c = byCategoryClaude[cat];
		console.log(`    ${cat}: ${g.pass}/${g.total} / ${c.pass}/${c.total}`);
	}

	return { model: config.name, geminiRate, claudeRate, geminiTotal, claudeTotal, total: results.length, encodeTime, testTime, byCategoryGemini, byCategoryClaude, results };
}

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	const filter = process.argv[2]; // "gemini" or "ollama" or undefined (all)

	const allConfigs = getModelConfigs(apiKey);
	const configs = filter
		? allConfigs.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
		: allConfigs;

	if (configs.length === 0) {
		console.error("No matching models. Available:", allConfigs.map((c) => c.name).join(", "));
		process.exit(1);
	}

	const allResults: any[] = [];
	for (const config of configs) {
		const result = await runForModel(config);
		allResults.push(result);
	}

	// Comparison table
	console.log(`\n${"=".repeat(60)}`);
	console.log("COMPARISON");
	console.log(`${"=".repeat(60)}\n`);

	console.log("| Model | Pro Judge | Claude Judge | Test Time |");
	console.log("|-------|:---------:|:------------:|:---------:|");
	for (const r of allResults) {
		console.log(`| ${r.model} | **${r.geminiRate}%** (${r.geminiTotal}/${r.total}) | **${r.claudeRate}%** (${r.claudeTotal}/${r.total}) | ${(r.testTime/1000).toFixed(0)}s |`);
	}
	console.log("\nBy category (pro / claude):");
	for (const r of allResults) {
		console.log(`  ${r.model}:`);
		for (const cat of Object.keys(r.byCategoryGemini)) {
			const g = r.byCategoryGemini[cat];
			const c = r.byCategoryClaude[cat];
			console.log(`    ${cat}: ${g.pass}/${g.total} / ${c.pass}/${c.total}`);
		}
	}

	// Save
	const reportDir = join(import.meta.dirname ?? ".", "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `memory-v2-multi-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		version: "v2-multi",
		models: allResults,
	}, null, 2));
	console.log(`\nReport: ${reportPath}`);
}

main().catch(console.error);
