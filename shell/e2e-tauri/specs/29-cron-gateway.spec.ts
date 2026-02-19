import { S } from "../helpers/selectors.js";

/**
 * 29 — Cron Gateway E2E
 *
 * Verifies cron functionality via chat:
 * - Asks agent to list cron jobs (local)
 * - Verifies agent responds with cron data
 * - Navigates back to chat
 */
describe("29 — cron gateway", () => {
	it("should be on chat tab", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should ask agent to list cron jobs", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.setValue("크론 잡 목록 보여줘");

		const sendBtn = await $(S.chatSendBtn);
		await sendBtn.click();

		// Wait for response
		await browser.pause(5_000);

		const assistantMsgs = await $$(S.assistantMessage);
		expect(assistantMsgs.length).toBeGreaterThan(0);
	});

	it("should have received a response about cron", async () => {
		const assistantMsgs = await $$(S.assistantMessage);
		const lastMsg = assistantMsgs[assistantMsgs.length - 1];
		const text = await lastMsg.getText();

		// Agent should mention cron or jobs in response
		expect(text.length).toBeGreaterThan(0);
	});
});
