/**
 * Generate expanded test cases (50+) via LLM.
 * Uses the fact bank to create diverse query variations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("GEMINI_API_KEY required");
		process.exit(1);
	}

	const factBank = JSON.parse(
		readFileSync(join(import.meta.dirname, "fact-bank.json"), "utf-8"),
	);
	const factsText = factBank.facts
		.map((f: any) => `${f.id}: ${f.statement}`)
		.join("\n");
	const updatesText = (factBank.updates || [])
		.map((u: any) => `${u.id}: ${u.statement}`)
		.join("\n");

	const categories = [
		{
			name: "recall",
			count: 10,
			desc: "사실을 직접 물어보기. 다양한 표현 사용. expected_answer에 정답 키워드. 변경사항 적용 후 기준.",
		},
		{
			name: "abstention",
			count: 10,
			desc: '위 사실에 없는 것 물어보기. expected_answer는 "NONE". 유사하지만 다른 것 포함 (Nuxt vs Next, 수영 vs 러닝 등).',
		},
		{
			name: "semantic",
			count: 10,
			desc: '사실을 간접적으로 물어보기. 상위 개념 사용. expected_answer에 "관련 사실 N개 이상 언급" 형태.',
		},
		{
			name: "contradiction",
			count: 10,
			desc: "변경 전/후 확인. 현재값 확인, 변경 전 값이 안 나오는지, 변경 안 한 것 유지 확인. expected_answer에 현재 정답.",
		},
		{
			name: "synthesis",
			count: 10,
			desc: '여러 사실을 조합해서 답해야 하는 질문. expected_answer에 "N개 이상 사실 조합" 형태.',
		},
	];

	const allTests: any[] = [];

	for (const cat of categories) {
		console.log(`Generating ${cat.name} (${cat.count})...`);

		const prompt = `다음 사실을 기반으로 "${cat.name}" 카테고리 테스트 ${cat.count}개를 만들어줘.
JSON 배열로 출력. 각 항목: {"id": "${cat.name.charAt(0).toUpperCase()}01", "query": "질문", "expected_answer": "정답", "category": "${cat.name}"}

사실:
${factsText}

변경사항 (적용 후):
${updatesText}

카테고리 설명: ${cat.desc}

규칙:
- 한국어 자연어
- 같은 사실을 다른 표현으로 (예: "에디터 뭐야?" vs "코딩할 때 뭐로 짜?")
- id는 ${cat.name.charAt(0).toUpperCase()}01부터 순서대로
- JSON 배열만 출력, 마크다운 없이`;

		const res = await fetch(`${GEMINI_BASE}chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gemini-2.5-flash",
				messages: [{ role: "user", content: prompt }],
				max_tokens: 4096,
			}),
		});

		const data = (await res.json()) as any;
		const content = data.choices?.[0]?.message?.content ?? "";
		const jsonStr = content
			.replace(/```json\n?/g, "")
			.replace(/```/g, "")
			.trim();

		let tests: any[];
		try {
			tests = JSON.parse(jsonStr);
		} catch {
			const fixed = `${jsonStr.replace(/,\s*$/, "")}]`;
			try {
				tests = JSON.parse(fixed);
			} catch {
				const matches = jsonStr.match(/\{[^}]+\}/g) || [];
				tests = matches
					.map((m: string) => {
						try {
							return JSON.parse(m);
						} catch {
							return null;
						}
					})
					.filter(Boolean);
			}
		}

		console.log(`  Got ${tests.length} tests`);
		allTests.push(...tests);
	}

	const tests = allTests;

	console.log(`Generated ${tests.length} test cases`);

	// Count by category
	const counts: Record<string, number> = {};
	for (const t of tests) {
		counts[t.category] = (counts[t.category] || 0) + 1;
	}
	for (const [cat, count] of Object.entries(counts)) {
		console.log(`  ${cat}: ${count}`);
	}

	// Save
	const outPath = join(import.meta.dirname, "test-cases-v3.json");
	writeFileSync(outPath, JSON.stringify(tests, null, 2));
	console.log(`Saved: ${outPath}`);
}

main().catch(console.error);
