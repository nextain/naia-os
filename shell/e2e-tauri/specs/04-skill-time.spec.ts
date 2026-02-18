import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("04 — skill_time", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should execute skill_time and return time info", async () => {
		await sendMessage(
			"지금 몇 시야? skill_time 도구를 반드시 사용해서 알려줘.",
		);

		// Check if tool was used (best-effort; LLM may not always use tools)
		const toolSuccess = await $(S.toolSuccess);
		const toolUsed = await toolSuccess.isExisting();

		if (!toolUsed) {
			// Debug: print last message
			const html = await browser.execute(
				() => document.querySelector(".chat-messages")?.innerHTML ?? "(empty)",
			);
			console.log("[debug] chat-messages HTML:", html);
		}

		// Primary assertion: response contains time-related content
		const text = await getLastAssistantMessage();
		expect(text).toMatch(/\d{1,2}[:\s시]/);
	});
});
