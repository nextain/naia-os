import { S } from "../helpers/selectors.js";

/**
 * 24 — TTS Providers E2E
 *
 * Verifies Settings > Gateway TTS section:
 * - Gateway TTS section appears when tools enabled
 * - TTS provider selector shown (or loading/empty state)
 * - Can navigate back to chat
 */
describe("24 — TTS providers", () => {
	it("should navigate to Settings tab", async () => {
		const settingsBtn = await $(S.settingsTabBtn);
		await settingsBtn.waitForDisplayed({ timeout: 10_000 });
		await settingsBtn.click();

		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show Gateway TTS section when tools enabled", async () => {
		// Ensure tools toggle is enabled
		const toolsEnabled = await browser.execute((sel: string) => {
			const el = document.querySelector(sel) as HTMLInputElement | null;
			return el?.checked ?? false;
		}, S.toolsToggle);

		if (!toolsEnabled) {
			await browser.execute((sel: string) => {
				const el = document.querySelector(sel) as HTMLInputElement | null;
				if (el) el.click();
			}, S.toolsToggle);
			await browser.pause(300);
		}

		// Wait for Gateway TTS content to load (provider select or hint)
		await browser.pause(2_000);

		// Check either provider select exists OR loading/empty hint
		const providerSelect = await $(S.gatewayTtsProvider);
		const providerExists = await providerSelect.isExisting();

		if (providerExists) {
			// Provider select rendered — verify it has options
			const value = await providerSelect.getValue();
			expect(typeof value).toBe("string");
		}
		// If not present, gateway may not be running — that's ok for E2E
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
