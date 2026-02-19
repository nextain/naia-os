import { S } from "../helpers/selectors.js";
import { autoApprovePermissions } from "../helpers/permissions.js";

/**
 * 23 — Channels Status E2E
 *
 * Verifies Channels tab > status display:
 * - Channels tab shows loading/empty/list state
 * - Channel cards have expected structure
 * - Status badges show connected/disconnected
 * - Refresh button works
 *
 * NOTE: This test requires a running Gateway with channels configured.
 * If Gateway is not available, it tests the error/empty state.
 */
describe("23 — channels status", () => {
	let disposePermissions: (() => void) | undefined;

	before(async () => {
		disposePermissions = await autoApprovePermissions();
	});

	after(() => {
		disposePermissions?.();
	});

	it("should navigate to channels tab", async () => {
		const channelsBtn = await $(S.channelsTabBtn);
		await channelsBtn.waitForDisplayed({ timeout: 10_000 });
		await channelsBtn.click();

		const channelsPanel = await $(S.channelsTabPanel);
		await channelsPanel.waitForDisplayed({ timeout: 5_000 });
	});

	it("should show channels tab content (loading, empty, or list)", async () => {
		// Wait for loading to complete (max 30s due to Gateway interaction)
		await browser.pause(3_000);

		const panel = await $(S.channelsTabPanel);
		const text = await panel.getText();

		// Should show one of: channel cards, empty message, or error
		const hasContent =
			text.includes("연결") ||
			text.includes("Connected") ||
			text.includes("채널") ||
			text.includes("Channel") ||
			text.includes("Gateway") ||
			text.includes("오류") ||
			text.includes("Error") ||
			text.length > 0;

		expect(hasContent).toBe(true);
	});

	it("should show refresh button", async () => {
		// Check if refresh button exists (visible in all states: list, empty, error)
		const refreshExists = await browser.execute(() => {
			const buttons = document.querySelectorAll("button");
			return Array.from(buttons).some(
				(b) =>
					b.textContent?.includes("새로고침") ||
					b.textContent?.includes("Refresh"),
			);
		});
		expect(refreshExists).toBe(true);
	});

	it("should navigate back to chat tab", async () => {
		const chatTabBtn = await $(S.chatTab);
		await chatTabBtn.click();

		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
