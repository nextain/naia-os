import {
	countCompletedAssistantMessages,
	getLastToolName,
	getLastAssistantMessage,
	getNewAssistantMessages,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { judgeAllSemantics } from "../helpers/semantic.js";

describe("04 — skill_time", () => {
	before(async () => {
		const apiKey = process.env.CAFE_E2E_API_KEY || process.env.GEMINI_API_KEY || "";
		const gatewayToken =
			process.env.CAFE_GATEWAY_TOKEN ||
			process.env.GATEWAY_MASTER_KEY ||
			"cafelua-dev-token";
		await browser.execute(
			(key: string, token: string) => {
				const raw = localStorage.getItem("cafelua-config");
				const prev = raw ? JSON.parse(raw) : {};
				const disabled = Array.isArray(prev.disabledSkills) ? prev.disabledSkills : [];
				const builtins = new Set([
					"skill_time",
					"skill_system_status",
					"skill_memo",
					"skill_weather",
					"skill_notify_slack",
					"skill_notify_discord",
					"skill_skill_manager",
				]);
				const config = {
					...prev,
					provider: "gemini",
					model: prev.model || "gemini-2.5-flash",
					apiKey: key || prev.apiKey || "",
					enableTools: true,
					gatewayUrl: prev.gatewayUrl || "ws://localhost:18789",
					gatewayToken: token || prev.gatewayToken || "cafelua-dev-token",
					onboardingComplete: true,
					disabledSkills: disabled.filter((n: string) => !builtins.has(n)),
				};
				localStorage.setItem("cafelua-config", JSON.stringify(config));
			},
			apiKey,
			gatewayToken,
		);
		await browser.refresh();
		const chatInput = await $(".chat-input");
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should execute skill_time and return time info", async () => {
		const beforeCount = await countCompletedAssistantMessages();
		await sendMessage("지금 몇 시야? skill_time 도구를 반드시 사용해서 알려줘.");
		let toolOk = true;
		try {
			await waitForToolSuccess();
		} catch {
			toolOk = false;
		}
		if (!toolOk) {
			await sendMessage(
				"반드시 skill_time 도구를 실제 호출해서 현재 시각을 HH:MM 형식으로만 답해.",
			);
			try {
				await waitForToolSuccess();
				toolOk = true;
			} catch {
				const last = await getLastAssistantMessage();
				throw new Error(`skill_time not executed after retry. last="${last.slice(0, 240)}"`);
			}
		}
		const tool = await getLastToolName();
		expect(tool).toMatch(/skill_time/i);

		const text = await getLastAssistantMessage();
		expect(text).not.toMatch(/\[오류\]|API key not valid|Bad Request|Tool Call:|print\s*\(/i);
		expect(text).toMatch(/\d{1,2}[:\s시]/);

		const newMsgs = await getNewAssistantMessages(beforeCount);
		const judged = await judgeAllSemantics({
			task: "사용자가 현재 시간을 물었고 skill_time 도구 사용이 요구됨",
			answers: newMsgs,
			criteria:
				"답변에 현재 시각(시/분 또는 HH:MM)이 포함되어 있어야 하며, 질문 의도(현재 시간 안내)를 충족해야 한다.",
		});
		expect(judged.verdict).toBe("PASS");
	});
});
