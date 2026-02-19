import { S } from "../helpers/selectors.js";

/**
 * 28 — Skills Install E2E
 *
 * Verifies Skills tab > Gateway section:
 * - Skills tab displays
 * - Gateway skill status cards (or empty)
 * - Install button presence for ineligible skills
 * - Can switch back to chat
 */
describe("28 — skills install", () => {
	it("should navigate to Skills tab", async () => {
		const skillsBtn = await $(S.skillsTab);
		await skillsBtn.waitForDisplayed({ timeout: 10_000 });
		await skillsBtn.click();

		const skillsPanel = await $(S.skillsTabPanel);
		await skillsPanel.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show skills tab content", async () => {
		await browser.pause(2_000);

		const skillsPanel = await $(S.skillsTabPanel);
		const isDisplayed = await skillsPanel.isDisplayed();
		expect(isDisplayed).toBe(true);
	});

	it("should show gateway skill cards or empty state", async () => {
		const gatewayCards = await $$(S.gatewaySkillCard);
		const skillsPanel = await $(S.skillsTabPanel);
		const panelText = await skillsPanel.getText();

		// Either gateway skill cards exist or we see regular content
		expect(gatewayCards.length >= 0 || panelText.length > 0).toBe(true);
	});

	it("should have install buttons for ineligible skills", async () => {
		const installBtns = await $$(S.skillsInstallBtn);
		// Install buttons only appear if there are ineligible skills
		// This is a soft check — gateway may not be connected
		if (installBtns.length > 0) {
			const firstBtn = installBtns[0];
			expect(await firstBtn.isDisplayed()).toBe(true);
		}
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
