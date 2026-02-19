const JUDGE_MODEL = process.env.CAFE_E2E_JUDGE_MODEL || "gemini-2.5-flash";
const JUDGE_API_KEY = process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY;
const JUDGE_TIMEOUT_MS = Number(process.env.CAFE_E2E_JUDGE_TIMEOUT_MS || "15000");

interface SemanticJudgeResult {
	verdict: "PASS" | "FAIL";
	reason: string;
}

function extractJson(text: string): SemanticJudgeResult {
	const m = text.match(/\{[\s\S]*\}/);
	if (!m) {
		return {
			verdict: "FAIL",
			reason: `No JSON found in judge response: ${text.slice(0, 160)}`,
		};
	}
	try {
		const parsed = JSON.parse(m[0]) as Partial<SemanticJudgeResult>;
		const verdict = parsed.verdict === "PASS" ? "PASS" : "FAIL";
		return {
			verdict,
			reason: parsed.reason ?? "No reason",
		};
	} catch (err) {
		return {
			verdict: "FAIL",
			reason: `Invalid JSON from judge: ${String(err)}`,
		};
	}
}

export async function judgeSemantics(opts: {
	task: string;
	answer: string;
	criteria: string;
}): Promise<SemanticJudgeResult> {
	if (!JUDGE_API_KEY) {
		return {
			verdict: "FAIL",
			reason: "Missing judge API key (CAFE_E2E_API_KEY or GEMINI_API_KEY)",
		};
	}

	const prompt =
		`You are a strict E2E semantic judge.\n` +
		`Task: ${opts.task}\n` +
		`Answer: ${opts.answer}\n` +
		`Criteria: ${opts.criteria}\n` +
		`Return JSON only: {"verdict":"PASS|FAIL","reason":"..."}\n`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
	const res = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent?key=${JUDGE_API_KEY}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				contents: [{ role: "user", parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: 0,
				},
			}),
			signal: controller.signal,
		},
	).catch((err) => {
		return {
			ok: false,
			status: 599,
			json: async () => ({}),
			__err: String(err),
		} as unknown as Response;
	});
	clearTimeout(timeoutId);

	if (!res.ok) {
		return {
			verdict: "FAIL",
			reason: `Judge HTTP ${res.status}`,
		};
	}

	const body = await res.json();
	const text: string =
		body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
		"";
	return extractJson(text);
}

export async function judgeAllSemantics(opts: {
	task: string;
	answers: string[];
	criteria: string;
}): Promise<SemanticJudgeResult> {
	if (opts.answers.length === 0) {
		return {
			verdict: "FAIL",
			reason: "No assistant messages to judge",
		};
	}

	for (const answer of opts.answers) {
		if (/Tool Call:|print\s*\(\s*skill_[a-z0-9_-]+\s*\)|잠시만 기다려/i.test(answer)) {
			return {
				verdict: "FAIL",
				reason: "Placeholder/tool-call-only message detected",
			};
		}
	}

	let reasons: string[] = [];
	for (const answer of opts.answers) {
		const judged = await judgeSemantics({
			task: opts.task,
			answer,
			criteria: opts.criteria,
		});
		reasons.push(judged.reason);
		if (judged.verdict !== "PASS") {
			return {
				verdict: "FAIL",
				reason: judged.reason,
			};
		}
	}

	return {
		verdict: "PASS",
		reason: reasons.join(" | "),
	};
}
