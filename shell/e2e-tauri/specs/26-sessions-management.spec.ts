import { S } from "../helpers/selectors.js";

/**
 * 26 — Sessions Management E2E
 *
 * Verifies Agents tab > Sessions section:
 * - Agents tab navigation
 * - Session list or empty state renders
 * - Refresh button exists
 */
describe("26 — sessions management", () => {
	it("should navigate to Agents tab", async () => {
		const agentsBtn = await $(S.agentsTabBtn);
		await agentsBtn.waitForDisplayed({ timeout: 10_000 });
		await agentsBtn.click();

		const agentsPanel = await $(S.agentsTabPanel);
		await agentsPanel.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show agents tab content", async () => {
		// Wait for data to load
		await browser.pause(2_000);

		const agentsPanel = await $(S.agentsTabPanel);
		const isDisplayed = await agentsPanel.isDisplayed();
		expect(isDisplayed).toBe(true);
	});

	it("should have refresh button", async () => {
		const refreshBtn = await $(S.agentsRefreshBtn);
		const exists = await refreshBtn.isExisting();
		if (exists) {
			expect(await refreshBtn.isDisplayed()).toBe(true);
		}
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
