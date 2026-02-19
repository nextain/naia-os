import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("18 — provider tool calling (xAI)", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should execute skill_time via xAI provider and return time", async () => {
		// This test requires xAI provider to be configured in settings
		await sendMessage(
			"지금 몇 시야? 반드시 skill_time 도구를 사용해서 알려줘.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/\d{1,2}[:\s시]/);
	});
});
