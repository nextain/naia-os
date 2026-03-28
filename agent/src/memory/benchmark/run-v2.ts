/**
 * Benchmark v2 — LLM response layer measurement.
 *
 * Tests the FULL pipeline: encode → search → LLM response → judge
 * Judge: keyword-based (deterministic) for recall/abstention/contradiction,
 *        LLM-based only for semantic/synthesis.
 * 3 runs per test, 2/3 pass = PASS.
 * 1-second throttle between all API calls.
 *
 * Requires GEMINI_API_KEY environment variable.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const RUNS = 3;
const PASS_THRESHOLD = 2; // 2/3
const THROTTLE_MS = 2000;

interface TestCase {
	id: string;
	query: string;
	category: "recall" | "abstention" | "semantic" | "contradiction" | "synthesis";
	/** For keyword judge: keywords that MUST appear in response */
	keywords?: string[];
	/** For keyword judge: keywords that must NOT appear */
	antiKeywords?: string[];
	/** For LLM judge: freeform expected description */
	expectedDescription?: string;
}

/** Throttle helper */
async function throttle(): Promise<void> {
	await new Promise((r) => setTimeout(r, THROTTLE_MS));
}

/** Call Gemini chat API with retry */
async function callGemini(
	apiKey: string,
	messages: Array<{ role: string; content: string }>,
	maxTokens: number,
): Promise<string> {
	for (let attempt = 0; attempt < 3; attempt++) {
		await throttle();
		const res = await fetch(`${GEMINI_BASE}chat/completions`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gemini-2.5-flash",
				messages,
				max_tokens: maxTokens,
			}),
		});

		if (!res.ok) {
			console.error(`    ⚠ HTTP ${res.status} (attempt ${attempt + 1}/3)`);
			await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
			continue;
		}

		const data = await res.json() as any;
		const content = data.choices?.[0]?.message?.content ?? "";
		if (content.length > 0) return content;
		await new Promise((r) => setTimeout(r, 2000));
	}
	return "";
}

/** Ask LLM with memory context */
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

	return callGemini(apiKey, [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: question },
	], 200);
}

/**
 * Deterministic keyword judge.
 * - recall/contradiction: response must contain at least one keyword
 * - abstention: response must contain refusal pattern AND not contain antiKeywords
 */
function keywordJudge(
	response: string,
	tc: TestCase,
): { pass: boolean; reason: string } {
	const lower = response.toLowerCase();

	if (tc.category === "abstention") {
		// Check for refusal patterns
		const refusalPatterns = [
			"말씀하신 적", "기억에 없", "모르", "없는 것 같",
			"언급하신 적", "관련된 기억", "기억이 없", "알 수 없",
			"말한 적", "들은 적", "정보가 없",
		];
		const hasRefusal = refusalPatterns.some((p) => lower.includes(p));
		// Also check that response doesn't confidently assert something
		const assertionPatterns = [
			"네,", "맞아", "그렇습니다", "하셨습니다", "라고 하셨",
		];
		const hasAssertion = assertionPatterns.some((p) => lower.includes(p));

		if (hasRefusal && !hasAssertion) {
			return { pass: true, reason: `PASS(keyword): refusal detected` };
		}
		if (hasAssertion) {
			return { pass: false, reason: `FAIL(keyword): assertion found despite no data` };
		}
		// Ambiguous — check if antiKeywords present
		if (tc.antiKeywords?.some((k) => lower.includes(k.toLowerCase()))) {
			return { pass: false, reason: `FAIL(keyword): antiKeyword found` };
		}
		return { pass: false, reason: `FAIL(keyword): no clear refusal pattern` };
	}

	// recall / contradiction: must contain at least one keyword
	if (tc.keywords && tc.keywords.length > 0) {
		const found = tc.keywords.filter((k) => lower.includes(k.toLowerCase()));
		if (found.length > 0) {
			return { pass: true, reason: `PASS(keyword): found [${found.join(", ")}]` };
		}
		return { pass: false, reason: `FAIL(keyword): none of [${tc.keywords.join(", ")}] found in "${response.slice(0, 80)}"` };
	}

	return { pass: false, reason: "FAIL(keyword): no keywords defined" };
}

/** LLM judge for semantic/synthesis */
async function llmJudge(
	apiKey: string,
	question: string,
	response: string,
	expectedDescription: string,
): Promise<{ pass: boolean; reason: string }> {
	const prompt = `질문: "${question}"
AI 응답: "${response}"
기대하는 답의 조건: "${expectedDescription}"

판정 기준:
- AI 응답이 위 조건을 충족하면 PASS
- 표현이 달라도 의미가 같으면 PASS
- 조건을 충족하지 못하면 FAIL

반드시 첫 줄에 PASS 또는 FAIL만 적고, 둘째 줄에 이유를 한 줄로 적으세요.`;

	const verdict = await callGemini(apiKey, [{ role: "user", content: prompt }], 50);
	const firstLine = verdict.split("\n")[0].trim().toUpperCase();
	const pass = firstLine === "PASS" || firstLine.startsWith("PASS");
	return { pass, reason: verdict.slice(0, 100) || "EMPTY" };
}

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("GEMINI_API_KEY required");
		process.exit(1);
	}

	const { Memory } = await import("mem0ai/oss");

	const testCases: TestCase[] = [
		// === recall: keyword judge ===
		{ id: "R01", query: "내 이름이 뭐야?", category: "recall", keywords: ["김하늘"] },
		{ id: "R02", query: "나 뭐하는 사람이야?", category: "recall", keywords: ["대표", "개발자", "스타트업"] },
		{ id: "R03", query: "내 에디터 뭐야?", category: "recall", keywords: ["cursor"] },
		{ id: "R04", query: "나 어디 살아?", category: "recall", keywords: ["판교"] },
		{ id: "R05", query: "내가 좋아하는 커피가 뭐야?", category: "recall", keywords: ["아메리카노"] },
		{ id: "R06", query: "내 동생 이름이 뭐야?", category: "recall", keywords: ["김바다"] },
		{ id: "R07", query: "내 OS가 뭐야?", category: "recall", keywords: ["fedora"] },
		{ id: "R08", query: "내 취미가 뭐야?", category: "recall", keywords: ["러닝", "달리기", "running"] },
		{ id: "R09", query: "나 Git 어떻게 써?", category: "recall", keywords: ["cli"] },
		// === abstention: keyword judge ===
		{ id: "A01", query: "내가 Docker 관련해서 뭐라고 했었지?", category: "abstention" },
		{ id: "A02", query: "내가 좋아하는 게임이 뭐야?", category: "abstention" },
		{ id: "A03", query: "나 고양이 키운다고 했지?", category: "abstention" },
		{ id: "A04", query: "내가 Nuxt.js 쓴다고 했었나?", category: "abstention" },
		{ id: "A05", query: "나 수영 한다고 했었나?", category: "abstention" },
		{ id: "A06", query: "내 차가 뭐야?", category: "abstention" },
		{ id: "A07", query: "내가 일본어 할 줄 안다고 했었나?", category: "abstention" },
		{ id: "A08", query: "내가 AWS 쓴다고 했나?", category: "abstention" },
		{ id: "A09", query: "나 피아노 친다고 했지?", category: "abstention" },
		// === semantic: LLM judge ===
		{ id: "S01", query: "내 개발 환경 어떻게 되지?", category: "semantic", expectedDescription: "TypeScript, Cursor, Next.js, FastAPI, Django 중 2개 이상 언급" },
		{ id: "S02", query: "나 음식 취향이 어때?", category: "semantic", expectedDescription: "아메리카노 또는 매운 음식 못 먹는다는 내용 중 1개 이상" },
		{ id: "S03", query: "주말에 뭐 하지?", category: "semantic", expectedDescription: "러닝 또는 한강 중 1개 이상 언급" },
		// === contradiction: keyword judge ===
		{ id: "C01", query: "내가 쓰는 에디터 뭐야?", category: "contradiction", keywords: ["cursor"] },
		{ id: "C02", query: "나 어디 살아?", category: "contradiction", keywords: ["판교"] },
		// === synthesis: LLM judge ===
		{ id: "M01", query: "새 프로젝트 하나 세팅해줘", category: "synthesis", expectedDescription: "TypeScript, Next.js, Cursor, Fedora 등 사용자의 기술 스택 중 2개 이상이 프로젝트 세팅에 반영됨" },
	];

	// === Phase 1: Encode facts ===
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
	for (const fact of factBank.facts) {
		try {
			await throttle();
			const result = await m.add([{ role: "user", content: fact.statement }], { userId: "v2-user" });
			const memCount = result?.results?.length ?? 0;
			console.log(`  ✅ ${fact.id}: ${fact.statement.slice(0, 40)}... (${memCount} memories)`);
			encodedCount++;
		} catch (err: any) {
			console.log(`  ❌ ${fact.id}: ${err.message?.slice(0, 80)}`);
		}
	}

	for (const u of factBank.updates ?? []) {
		try {
			await throttle();
			await m.add([{ role: "user", content: u.statement }], { userId: "v2-user" });
			console.log(`  🔄 ${u.id}: ${u.statement.slice(0, 40)}...`);
		} catch (err: any) {
			console.log(`  ❌ ${u.id}: ${err.message?.slice(0, 80)}`);
		}
	}
	console.log(`  → Encoded: ${encodedCount}/${factBank.facts.length}`);

	// === Phase 1.5: Verify ===
	console.log("\n=== Phase 1.5: Stored memories ===\n");
	try {
		const allMems = await m.getAll({ userId: "v2-user" });
		const memList = allMems?.results ?? allMems ?? [];
		console.log(`  Total: ${memList.length}`);
		for (const mem of memList) {
			console.log(`    - ${(mem.memory ?? mem.text ?? "").slice(0, 80)}`);
		}
	} catch (err: any) {
		console.log(`  ⚠ getAll failed: ${err.message?.slice(0, 80)}`);
	}

	// === Phase 2: Run tests ===
	console.log(`\n=== Phase 2: ${testCases.length} tests × ${RUNS} runs ===\n`);

	const results: Array<{
		id: string;
		query: string;
		category: string;
		runs: Array<{ memories: string[]; response: string; pass: boolean; reason: string }>;
		finalPass: boolean;
	}> = [];

	for (const tc of testCases) {
		const runs: Array<{ memories: string[]; response: string; pass: boolean; reason: string }> = [];

		for (let run = 0; run < RUNS; run++) {
			// Search
			let memories: string[] = [];
			if (tc.category === "synthesis") {
				try {
					const allMems = await m.getAll({ userId: "v2-user" });
					memories = (allMems?.results ?? allMems ?? []).map((r: any) => r.memory ?? r.text ?? "");
				} catch {}
			} else {
				const limit = tc.category === "semantic" ? 10 : 5;
				try {
					await throttle();
					const raw = await m.search(tc.query, { userId: "v2-user", limit });
					memories = (raw?.results ?? raw ?? []).map((r: any) => r.memory ?? r.text ?? "");
				} catch (err: any) {
					console.error(`    ⚠ search error: ${err.message?.slice(0, 60)}`);
				}
			}

			// Ask
			const response = await askWithMemory(apiKey, memories, tc.query);

			// Judge
			let verdict: { pass: boolean; reason: string };
			if (tc.category === "semantic" || tc.category === "synthesis") {
				verdict = await llmJudge(apiKey, tc.query, response, tc.expectedDescription ?? "");
			} else {
				verdict = keywordJudge(response, tc);
			}

			runs.push({ memories, response: response.slice(0, 200), pass: verdict.pass, reason: verdict.reason });
			if (run === 0) {
				console.log(`    🔍 [${memories.length}] ${memories.map((m) => m.slice(0, 40)).join(" | ") || "(empty)"}`);
				console.log(`    💬 ${response.slice(0, 100)}`);
				console.log(`    📋 ${verdict.reason.slice(0, 80)}`);
			}
		}

		const passCount = runs.filter((r) => r.pass).length;
		const finalPass = passCount >= PASS_THRESHOLD;
		results.push({ id: tc.id, query: tc.query, category: tc.category, runs, finalPass });

		console.log(`  ${finalPass ? "✅" : "❌"} [${tc.category}] ${tc.id} "${tc.query.slice(0, 30)}..." (${passCount}/${RUNS})\n`);
	}

	// === Report ===
	const totalPass = results.filter((r) => r.finalPass).length;
	const byCategory: Record<string, { pass: number; total: number }> = {};
	for (const r of results) {
		if (!byCategory[r.category]) byCategory[r.category] = { pass: 0, total: 0 };
		byCategory[r.category].total++;
		if (r.finalPass) byCategory[r.category].pass++;
	}

	console.log(`\n=== RESULTS ===`);
	console.log(`Total: ${totalPass}/${results.length} (${Math.round((totalPass / results.length) * 100)}%)`);
	for (const [name, cat] of Object.entries(byCategory)) {
		console.log(`  ${name}: ${cat.pass}/${cat.total}`);
	}

	const reportDir = join(import.meta.dirname, "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `memory-v2-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		version: "v2.1",
		judge: "keyword(recall/abstention/contradiction) + llm(semantic/synthesis)",
		model: "gemini-2.5-flash",
		total: results.length,
		passed: totalPass,
		passRate: Math.round((totalPass / results.length) * 100),
		byCategory,
		details: results,
	}, null, 2));
	console.log(`Report: ${reportPath}`);
}

main().catch(console.error);
