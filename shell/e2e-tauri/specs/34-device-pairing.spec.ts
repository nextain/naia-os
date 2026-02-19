import { S } from "../helpers/selectors.js";

/**
 * 34 — Device Pairing E2E
 *
 * Verifies device/node awareness via chat:
 * - Ask agent about connected devices
 * - Agent responds
 */
describe("34 — device pairing", () => {
	it("should be on chat tab", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should ask agent about connected devices", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.setValue("연결된 디바이스 목록 보여줘");

		const sendBtn = await $(S.chatSendBtn);
		await sendBtn.click();

		await browser.pause(5_000);

		const assistantMsgs = await $$(S.assistantMessage);
		expect(assistantMsgs.length).toBeGreaterThan(0);
	});
});
