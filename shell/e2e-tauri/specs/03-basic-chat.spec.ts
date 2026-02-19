import { getLastAssistantMessage, sendMessage } from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("03 — Basic Chat", () => {
	before(async () => {
		// Ensure chat input is available (settings already configured in 02)
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should send a message and receive a response", async () => {
		await sendMessage("안녕");

		const text = await getLastAssistantMessage();
		expect(text).not.toMatch(/\[오류\]|API key not valid|Bad Request/i);
		expect(text.length).toBeGreaterThan(0);
	});
});
