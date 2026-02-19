import { S } from "../helpers/selectors.js";

/**
 * 31 — Diagnostics E2E
 *
 * Verifies Gateway health via chat:
 * - Ask agent about system health
 * - Agent responds with status info
 */
describe("31 — diagnostics", () => {
	it("should be on chat tab", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should ask agent about system status", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.setValue("시스템 상태 확인해줘");

		const sendBtn = await $(S.chatSendBtn);
		await sendBtn.click();

		await browser.pause(5_000);

		const assistantMsgs = await $$(S.assistantMessage);
		expect(assistantMsgs.length).toBeGreaterThan(0);
	});
});
