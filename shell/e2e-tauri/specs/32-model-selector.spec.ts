import { S } from "../helpers/selectors.js";

/**
 * 32 — Model Selector E2E
 *
 * Verifies Settings tab model configuration:
 * - Settings tab displays
 * - Provider selector exists
 * - Can navigate back to chat
 */
describe("32 — model selector", () => {
	it("should navigate to Settings tab", async () => {
		const settingsBtn = await $(S.settingsTabBtn);
		await settingsBtn.waitForDisplayed({ timeout: 10_000 });
		await settingsBtn.click();

		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 5_000 });
	});

	it("should have provider select", async () => {
		const providerSelect = await $(S.providerSelect);
		const exists = await providerSelect.isExisting();
		expect(exists).toBe(true);
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
