/**
 * No-memory baseline — same LLM, same tests, NO memory system.
 * Measures what the LLM alone can do without any recalled memories.
 * The difference between this and the memory benchmark = memory system's pure contribution.
 *
 * Uses Claude CLI as judge (same as main benchmark).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const RUNS = 3;
const PASS_THRESHOLD = 2;

interface TestCase {
	id: string;
	query: string;
	expected_answer: string;
	category: string;
}

const TEST_CASES: TestCase[] = [
	{ id: "R01", query: "내 이름이 뭐야?", expected_answer: "김하늘", category: "recall" },
	{ id: "R02", query: "나 뭐하는 사람이야?", expected_answer: "대표, 개발자", category: "recall" },
	{ id: "R03", query: "내 에디터 뭐야?", expected_answer: "Cursor (변경됨)", category: "recall" },
	{ id: "R04", query: "나 어디 살아?", expected_answer: "판교 (이사함)", category: "recall" },
	{ id: "R05", query: "내가 좋아하는 커피가 뭐야?", expected_answer: "아메리카노", category: "recall" },
	{ id: "R06", query: "내 동생 이름이 뭐야?", expected_answer: "김바다", category: "recall" },
	{ id: "R07", query: "내 OS가 뭐야?", expected_answer: "Fedora", category: "recall" },
	{ id: "R08", query: "내 취미가 뭐야?", expected_answer: "러닝", category: "recall" },
	{ id: "R09", query: "나 Git 어떻게 써?", expected_answer: "CLI", category: "recall" },
	{ id: "A01", query: "내가 Docker 관련해서 뭐라고 했었지?", expected_answer: "NONE", category: "abstention" },
	{ id: "A02", query: "내가 좋아하는 게임이 뭐야?", expected_answer: "NONE", category: "abstention" },
	{ id: "A03", query: "나 고양이 키운다고 했지?", expected_answer: "NONE", category: "abstention" },
	{ id: "A04", query: "내가 Nuxt.js 쓴다고 했었나?", expected_answer: "NONE", category: "abstention" },
	{ id: "A05", query: "나 수영 한다고 했었나?", expected_answer: "NONE", category: "abstention" },
	{ id: "A06", query: "내 차가 뭐야?", expected_answer: "NONE", category: "abstention" },
	{ id: "A07", query: "내가 일본어 할 줄 안다고 했었나?", expected_answer: "NONE", category: "abstention" },
	{ id: "A08", query: "내가 AWS 쓴다고 했나?", expected_answer: "NONE", category: "abstention" },
	{ id: "A09", query: "나 피아노 친다고 했지?", expected_answer: "NONE", category: "abstention" },
	{ id: "S01", query: "내 개발 환경 어떻게 되지?", expected_answer: "TypeScript, Neovim/Cursor, Next.js, FastAPI 중 2개 이상", category: "semantic" },
	{ id: "S02", query: "나 음식 취향이 어때?", expected_answer: "아메리카노, 매운 음식 못 먹음", category: "semantic" },
	{ id: "S03", query: "주말에 뭐 하지?", expected_answer: "러닝, 한강", category: "semantic" },
	{ id: "C01", query: "내가 쓰는 에디터 뭐야?", expected_answer: "Cursor", category: "contradiction" },
	{ id: "C02", query: "나 어디 살아?", expected_answer: "판교", category: "contradiction" },
];

async function askGemini(apiKey: string, question: string): Promise<string> {
	// NO memory context — just the system prompt and question
	const systemPrompt = `당신은 사용자의 개인 AI 동반자입니다.
사용자에 대해 아는 것이 없습니다. 이전 대화 기록도 없습니다.
모르는 것은 솔직히 모른다고 답하세요.`;

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
	const data = await res.json() as any;
	return data.choices?.[0]?.message?.content ?? "";
}

function judgeClaude(question: string, response: string, expected: string): boolean {
	const isAbstention = expected === "NONE";
	const prompt = isAbstention
		? `질문: "${question}"\nAI 응답: "${response}"\nAI가 "모른다/말한 적 없다/기억에 없다"고 올바르게 답했으면 PASS, 없는 정보를 지어냈으면 FAIL.\n한 단어로만: PASS 또는 FAIL`
		: `질문: "${question}"\nAI 응답: "${response}"\n기대 정답: "${expected}"\nAI 응답이 기대 정답과 의미적으로 일치하면 PASS. 표현이 달라도 같은 뜻이면 PASS.\n한 단어로만: PASS 또는 FAIL`;

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

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) { console.error("GEMINI_API_KEY required"); process.exit(1); }

	console.log("=== NO-MEMORY BASELINE (gemini-2.5-flash, Claude judge) ===\n");
	console.log("LLM에 기억을 주입하지 않고 같은 질문. 기억 시스템의 순수 기여도 측정.\n");

	const results: Array<{ id: string; category: string; passCount: number; finalPass: boolean }> = [];

	for (const tc of TEST_CASES) {
		let passCount = 0;
		for (let run = 0; run < RUNS; run++) {
			const response = await askGemini(apiKey, tc.query);
			const pass = judgeClaude(tc.query, response, tc.expected_answer);
			if (pass) passCount++;
		}
		const finalPass = passCount >= PASS_THRESHOLD;
		results.push({ id: tc.id, category: tc.category, passCount, finalPass });
		console.log(`  ${finalPass ? "✅" : "❌"} [${tc.category}] ${tc.id} "${tc.query.slice(0, 30)}..." (${passCount}/${RUNS})`);
	}

	const totalPass = results.filter((r) => r.finalPass).length;
	const passRate = Math.round((totalPass / results.length) * 100);

	const byCategory: Record<string, { pass: number; total: number }> = {};
	for (const r of results) {
		if (!byCategory[r.category]) byCategory[r.category] = { pass: 0, total: 0 };
		byCategory[r.category].total++;
		if (r.finalPass) byCategory[r.category].pass++;
	}

	console.log(`\n=== NO-MEMORY BASELINE RESULTS ===`);
	console.log(`Total: ${totalPass}/${results.length} (${passRate}%)`);
	for (const [cat, v] of Object.entries(byCategory)) {
		console.log(`  ${cat}: ${v.pass}/${v.total}`);
	}

	const reportDir = join(import.meta.dirname, "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	writeFileSync(join(reportDir, `memory-no-memory-baseline-${new Date().toISOString().slice(0, 10)}.json`),
		JSON.stringify({ timestamp: new Date().toISOString(), label: "no-memory baseline (gemini-2.5-flash, Claude judge)", total: results.length, passed: totalPass, passRate, byCategory, details: results }, null, 2));
	console.log(`\nReport saved.`);
}

main().catch(console.error);
