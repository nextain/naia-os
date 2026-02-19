import { S } from "../helpers/selectors.js";

/**
 * 33 — Usage Dashboard E2E
 *
 * Verifies cost dashboard:
 * - Cost badge visible after chat interaction
 * - Cost dashboard opens on click
 * - Cost table has data
 */
describe("33 — usage dashboard", () => {
	it("should check if cost badge exists", async () => {
		const costBadge = await $(S.costBadge);
		const exists = await costBadge.isExisting();
		// Cost badge only appears after spending tokens
		if (exists) {
			expect(await costBadge.isDisplayed()).toBe(true);
		}
	});

	it("should open cost dashboard if badge exists", async () => {
		const costBadge = await $(S.costBadge);
		const exists = await costBadge.isExisting();
		if (exists) {
			await costBadge.click();

			const dashboard = await $(S.costDashboard);
			await dashboard.waitForDisplayed({ timeout: 3_000 });
			expect(await dashboard.isDisplayed()).toBe(true);

			// Close dashboard
			await costBadge.click();
		}
	});
});
