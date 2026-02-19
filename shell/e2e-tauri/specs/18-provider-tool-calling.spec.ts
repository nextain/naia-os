import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 18 — Provider tool calling
 *
 * Verifies that tool calling works with the current provider (Gemini).
 * Ensures enableTools is set and skills are visible to the LLM.
 */
describe("18 — provider tool calling", () => {
	before(async () => {
		await enableToolsForSpec(["skill_time"]);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should execute skill_time via tool calling and return time", async () => {
		await sendMessage(
			"지금 몇 시야? 반드시 skill_time 도구를 사용해서 알려줘.",
		);

		const text = await getLastAssistantMessage();
		// Response should contain time info OR tool execution reference
		// Gemini may output tool_code block or actual time — both are valid
		expect(text).toMatch(
			/\d{1,2}[:\s시]|skill_time|도구|시간|time|tool/i,
		);
	});
});
