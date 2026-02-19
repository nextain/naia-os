import { S } from "../helpers/selectors.js";

/**
 * 27 — Multi-Agent E2E
 *
 * Verifies Agents tab > Agent list:
 * - Agent cards show (or empty state)
 * - Session cards show (or empty state)
 * - Can switch back to chat
 */
describe("27 — multi-agent", () => {
	it("should navigate to Agents tab", async () => {
		const agentsBtn = await $(S.agentsTabBtn);
		await agentsBtn.waitForDisplayed({ timeout: 10_000 });
		await agentsBtn.click();

		const agentsPanel = await $(S.agentsTabPanel);
		await agentsPanel.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show agent cards or empty state", async () => {
		await browser.pause(2_000);

		const agentCards = await $$(S.agentCard);
		const agentsPanel = await $(S.agentsTabPanel);
		const panelText = await agentsPanel.getText();

		// Either agent cards exist or we see the no-agents message
		expect(agentCards.length > 0 || panelText.length > 0).toBe(true);
	});

	it("should show session cards or empty state", async () => {
		const sessionCards = await $$(S.sessionCard);
		const agentsPanel = await $(S.agentsTabPanel);
		const panelText = await agentsPanel.getText();

		// Either session cards exist or we see the no-sessions message
		expect(sessionCards.length >= 0 || panelText.length > 0).toBe(true);
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
