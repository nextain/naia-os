/**
 * Benchmark v2 — LLM response layer measurement.
 *
 * Key differences from v1:
 * 1. Tests the FULL pipeline: encode → search → LLM response → judge
 * 2. "있는 것"과 "없는 것"을 혼합, 정답표 기반 단일 정확도
 * 3. 3회 실행, 2/3 통과 = PASS
 *
 * Requires GEMINI_API_KEY environment variable.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const RUNS = 3;
const PASS_THRESHOLD = 2; // 2/3

interface TestCase {
	id: string;
	query: string;
	expected_answer: string; // 정답 (사실이면 내용, 없으면 "NONE")
	category: "recall" | "abstention" | "semantic" | "contradiction" | "synthesis";
}

/** LLM에게 기억 컨텍스트와 함께 질문하고 응답 받기 */
async function askWithMemory(
	apiKey: string,
	memories: string[],
	question: string,
): Promise<string> {
	const memoryContext = memories.length > 0
		? `<recalled_memories>\n${memories.map((m) => `- ${m}`).join("\n")}\n</recalled_memories>`
		: "(관련 기억 없음)";

	const systemPrompt = `당신은 사용자의 개인 AI 동반자입니다. 이전 대화에서 기억한 내용이 아래에 있습니다.

## 규칙
1. 기억 중에서 사용자 질문과 **직접 관련된 것만** 사용하세요.
2. 기억에 있더라도 질문과 무관한 내용은 답에 포함하지 마세요.
3. 질문에 대한 답이 기억에 없으면 "말씀하신 적 없는 것 같습니다" 또는 "기억에 없습니다"라고 답하세요.
4. 기억에 없는 내용을 절대 지어내지 마세요.
5. 여러 기억을 종합해서 답할 수 있으면 종합하세요.

${memoryContext}`;

	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(`${GEMINI_BASE}chat/completions`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gemini-2.5-flash",
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: question },
				],
				max_tokens: 200,
			}),
		});

		if (!res.ok) {
			console.error(`    ⚠ askWithMemory HTTP ${res.status} (attempt ${attempt + 1})`);
			await new Promise((r) => setTimeout(r, 1000));
			continue;
		}

		const data = await res.json() as any;
		const content = data.choices?.[0]?.message?.content ?? "";
		if (content.length > 0) return content;
		await new Promise((r) => setTimeout(r, 500));
	}
	return "";
}

/** LLM-as-judge: 응답이 정답과 일치하는지 판정 */
async function judge(
	apiKey: string,
	question: string,
	response: string,
	expectedAnswer: string,
): Promise<{ pass: boolean; reason: string }> {
	const isAbstention = expectedAnswer === "NONE";

	const prompt = isAbstention
		? `질문: "${question}"
AI 응답: "${response}"

이 질문에 대해 AI는 "모른다/말한 적 없다/기억에 없다"고 답해야 합니다.
AI가 정보를 지어내지 않고 올바르게 모른다고 답했으면 PASS, 없는 정보를 지어냈으면 FAIL.

한 단어로만 답하세요: PASS 또는 FAIL`
		: `질문: "${question}"
AI 응답: "${response}"
기대 정답에 포함되어야 할 핵심 내용: "${expectedAnswer}"

판정 기준: AI 응답이 기대 정답의 핵심 내용과 의미적으로 일치하면 PASS.
표현이 달라도 같은 뜻이면 PASS (예: "김하늘입니다" = "김하늘" → PASS).
핵심 내용이 없거나 다른 정보를 답하면 FAIL.

한 단어로만 답하세요: PASS 또는 FAIL`;

	// Retry up to 3 times if judge returns empty (Gemini API sometimes returns blank)
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(`${GEMINI_BASE}chat/completions`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gemini-2.5-flash",
				messages: [{ role: "user", content: prompt }],
				max_tokens: 10,
			}),
		});

		const data = await res.json() as any;
		const verdict = (data.choices?.[0]?.message?.content ?? "").trim().toUpperCase();

		if (verdict.length > 0) {
			return {
				pass: verdict === "PASS" || verdict.startsWith("PASS"),
				reason: verdict,
			};
		}
		// Empty response — wait briefly and retry
		await new Promise((r) => setTimeout(r, 500));
	}

	// All retries failed — return as inconclusive (not counted as PASS)
	return { pass: false, reason: "EMPTY_RESPONSE_3_RETRIES" };
}

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("GEMINI_API_KEY required");
		process.exit(1);
	}

	const { Memory } = await import("mem0ai/oss");

	// Test cases: 있는 것과 없는 것을 혼합
	const testCases: TestCase[] = [
		// === 있는 것 (recall) ===
		{ id: "R01", query: "내 이름이 뭐야?", expected_answer: "김하늘", category: "recall" },
		{ id: "R02", query: "나 뭐하는 사람이야?", expected_answer: "대표, 개발자", category: "recall" },
		{ id: "R03", query: "내 에디터 뭐야?", expected_answer: "Cursor (Neovim에서 변경됨)", category: "recall" },
		{ id: "R04", query: "나 어디 살아?", expected_answer: "판교 (성수동에서 이사)", category: "recall" },
		{ id: "R05", query: "내가 좋아하는 커피가 뭐야?", expected_answer: "아메리카노", category: "recall" },
		{ id: "R06", query: "내 동생 이름이 뭐야?", expected_answer: "김바다", category: "recall" },
		{ id: "R07", query: "내 OS가 뭐야?", expected_answer: "Fedora", category: "recall" },
		{ id: "R08", query: "내 취미가 뭐야?", expected_answer: "러닝", category: "recall" },
		{ id: "R09", query: "나 Git 어떻게 써?", expected_answer: "CLI", category: "recall" },
		// === 없는 것 (abstention) ===
		{ id: "A01", query: "내가 Docker 관련해서 뭐라고 했었지?", expected_answer: "NONE", category: "abstention" },
		{ id: "A02", query: "내가 좋아하는 게임이 뭐야?", expected_answer: "NONE", category: "abstention" },
		{ id: "A03", query: "나 고양이 키운다고 했지?", expected_answer: "NONE", category: "abstention" },
		{ id: "A04", query: "내가 Nuxt.js 쓴다고 했었나?", expected_answer: "NONE", category: "abstention" },
		{ id: "A05", query: "나 수영 한다고 했었나?", expected_answer: "NONE", category: "abstention" },
		{ id: "A06", query: "내 차가 뭐야?", expected_answer: "NONE", category: "abstention" },
		{ id: "A07", query: "내가 일본어 할 줄 안다고 했었나?", expected_answer: "NONE", category: "abstention" },
		{ id: "A08", query: "내가 AWS 쓴다고 했나?", expected_answer: "NONE", category: "abstention" },
		{ id: "A09", query: "나 피아노 친다고 했지?", expected_answer: "NONE", category: "abstention" },
		// === 시맨틱 검색 ===
		{ id: "S01", query: "내 개발 환경 어떻게 되지?", expected_answer: "TypeScript, Cursor, Next.js, FastAPI 중 2개 이상", category: "semantic" },
		{ id: "S02", query: "나 음식 취향이 어때?", expected_answer: "아메리카노, 매운 음식 못 먹음", category: "semantic" },
		{ id: "S03", query: "주말에 뭐 하지?", expected_answer: "러닝, 한강", category: "semantic" },
		// === 모순 감지 (Session 3에서 변경 후) ===
		{ id: "C01", query: "내가 쓰는 에디터 뭐야?", expected_answer: "Cursor", category: "contradiction" },
		{ id: "C02", query: "나 어디 살아?", expected_answer: "판교", category: "contradiction" },
		// === 종합 ===
		{ id: "M01", query: "새 프로젝트 하나 세팅해줘", expected_answer: "TypeScript, Next.js 등 기술 스택 반영", category: "synthesis" },
	];

	// Encode facts
	console.log("=== Phase 1: Encoding facts via mem0 ===\n");
	const factBank = JSON.parse(readFileSync(join(import.meta.dirname, "fact-bank.json"), "utf-8"));

	const dbPath = `/tmp/mem0-v2-${randomUUID()}`;
	const m = new Memory({
		embedder: { provider: "openai", config: { apiKey, baseURL: GEMINI_BASE, model: "gemini-embedding-001" } },
		vectorStore: { provider: "memory", config: { collectionName: "v2", dimension: 3072, dbPath: `${dbPath}-vec.db` } },
		llm: { provider: "openai", config: { apiKey, baseURL: GEMINI_BASE, model: "gemini-2.5-flash" } },
		historyDbPath: `${dbPath}-hist.db`,
	});

	let encodedCount = 0;
	let encodeErrors = 0;
	for (const fact of factBank.facts) {
		try {
			const result = await m.add([{ role: "user", content: fact.statement }], { userId: "v2-user" });
			const memCount = result?.results?.length ?? 0;
			console.log(`  ✅ ${fact.id}: ${fact.statement.slice(0, 40)}... (${memCount} memories created)`);
			encodedCount++;
		} catch (err: any) {
			console.log(`  ❌ ${fact.id}: ${err.message?.slice(0, 80)}`);
			encodeErrors++;
		}
	}
	console.log(`  → Encoded: ${encodedCount}/${factBank.facts.length}, errors: ${encodeErrors}`);

	// Apply updates for contradiction tests
	const updates = factBank.updates || [];
	for (const u of updates) {
		try {
			await m.add([{ role: "user", content: u.statement }], { userId: "v2-user" });
			console.log(`  🔄 ${u.id}: ${u.statement.slice(0, 40)}...`);
		} catch (err: any) {
			console.log(`  ❌ update ${u.id}: ${err.message?.slice(0, 80)}`);
		}
	}

	// Verify: dump all stored memories
	console.log("\n=== Phase 1.5: Verifying stored memories ===\n");
	try {
		const allMems = await m.getAll({ userId: "v2-user" });
		const memList = allMems?.results ?? allMems ?? [];
		console.log(`  Total memories stored: ${memList.length}`);
		for (const mem of memList.slice(0, 30)) {
			console.log(`    - ${(mem.memory ?? mem.text ?? "").slice(0, 80)}`);
		}
		if (memList.length > 30) console.log(`    ... and ${memList.length - 30} more`);
	} catch (err: any) {
		console.log(`  ⚠ getAll failed: ${err.message?.slice(0, 80)}`);
	}

	// Run tests
	console.log(`\n=== Phase 2: Running ${testCases.length} tests × ${RUNS} runs ===\n`);

	const results: Array<{
		id: string;
		query: string;
		expected: string;
		category: string;
		runs: Array<{ memories: string[]; response: string; pass: boolean; reason: string }>;
		finalPass: boolean;
	}> = [];

	for (const tc of testCases) {
		const runs: Array<{ memories: string[]; response: string; pass: boolean; reason: string }> = [];

		for (let run = 0; run < RUNS; run++) {
			// Search memories — use higher limit for semantic/synthesis questions
			let memories: string[] = [];
			const searchLimit = (tc.category === "semantic" || tc.category === "synthesis") ? 10 : 5;
			try {
				const raw = await m.search(tc.query, { userId: "v2-user", limit: searchLimit });
				memories = (raw?.results ?? raw ?? []).map((r: any) => r.memory ?? r.text ?? "");
			} catch (err: any) {
				console.error(`    ⚠ search error for "${tc.query.slice(0, 30)}": ${err.message?.slice(0, 80)}`);
			}

			// Get LLM response with memory context
			const response = await askWithMemory(apiKey, memories, tc.query);

			// Judge
			const verdict = await judge(apiKey, tc.query, response, tc.expected_answer);

			runs.push({ memories, response: response.slice(0, 200), pass: verdict.pass, reason: verdict.reason });
			if (run === 0) {
				console.log(`    🔍 search returned ${memories.length} memories: ${memories.map(m => m.slice(0, 50)).join(" | ") || "(empty)"}`);
			}
		}

		const passCount = runs.filter((r) => r.pass).length;
		const finalPass = passCount >= PASS_THRESHOLD;

		results.push({
			id: tc.id,
			query: tc.query,
			expected: tc.expected_answer,
			category: tc.category,
			runs,
			finalPass,
		});

		const icon = finalPass ? "✅" : "❌";
		console.log(`  ${icon} [${tc.category}] ${tc.id} "${tc.query.slice(0, 35)}..." (${passCount}/${RUNS})`);
	}

	// Aggregate
	const totalPass = results.filter((r) => r.finalPass).length;
	const totalTests = results.length;
	const passRate = Math.round((totalPass / totalTests) * 100);

	const byCategory: Record<string, { pass: number; total: number }> = {};
	for (const r of results) {
		if (!byCategory[r.category]) byCategory[r.category] = { pass: 0, total: 0 };
		byCategory[r.category].total++;
		if (r.finalPass) byCategory[r.category].pass++;
	}

	console.log(`\n=== BENCHMARK v2 RESULTS ===`);
	console.log(`Total: ${totalPass}/${totalTests} (${passRate}%)`);
	console.log(`Runs per test: ${RUNS}, pass threshold: ${PASS_THRESHOLD}/${RUNS}`);
	console.log("\nBy category:");
	for (const [name, cat] of Object.entries(byCategory)) {
		console.log(`  ${name}: ${cat.pass}/${cat.total}`);
	}

	// Save report
	const reportDir = join(import.meta.dirname, "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `memory-v2-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		version: "v2",
		label: "Benchmark v2 — LLM response layer (mem0 + Gemini)",
		model: "gemini-2.5-flash",
		embedding: "gemini-embedding-001",
		runs_per_test: RUNS,
		pass_threshold: PASS_THRESHOLD,
		total: totalTests,
		passed: totalPass,
		passRate,
		byCategory,
		details: results,
	}, null, 2));
	console.log(`\nReport saved: ${reportPath}`);
}

main().catch(console.error);
