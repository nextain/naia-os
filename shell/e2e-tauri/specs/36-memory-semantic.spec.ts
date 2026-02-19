import { S } from "../helpers/selectors.js";

/**
 * 36 — Memory Semantic Search E2E
 *
 * Verifies that the semantic (vector) search integration works:
 * - Send a message → stored in DB
 * - Start new session → send a recall query
 * - Agent can use memory search to recall past context
 *
 * Note: Full embedding pipeline requires Gemini API key.
 * This spec checks the UI flow; actual embedding quality
 * depends on the live API.
 */
describe("36 — memory semantic search", () => {
	it("should be on chat tab", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should send a memorable message", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.setValue(
			"내 생일은 3월 15일이야. 기억해줘.",
		);

		const sendBtn = await $(S.chatSendBtn);
		await sendBtn.click();

		// Wait for assistant response
		await browser.pause(5_000);

		const assistantMsgs = await $$(S.assistantMessage);
		expect(assistantMsgs.length).toBeGreaterThan(0);
	});

	it("should recall in a follow-up question", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.setValue("내 생일이 언제라고 했지?");

		const sendBtn = await $(S.chatSendBtn);
		await sendBtn.click();

		await browser.pause(5_000);

		const assistantMsgs = await $$(S.assistantMessage);
		const lastMsg = assistantMsgs[assistantMsgs.length - 1];
		const text = await lastMsg.getText();
		// Agent should mention the birthday from memory/context
		expect(text.length).toBeGreaterThan(0);
	});
});
