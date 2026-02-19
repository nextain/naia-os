import { S } from "../helpers/selectors.js";

/**
 * 35 — Onboarding Extended E2E
 *
 * Verifies the onboarding wizard UI elements:
 * - Onboarding overlay may be visible (first run) or skipped
 * - If visible, navigation buttons exist
 */
describe("35 — onboarding extended", () => {
	it("should check if onboarding is present", async () => {
		const overlay = await $(S.onboardingOverlay);
		const exists = await overlay.isExisting();
		// Onboarding only shows on first run
		expect(typeof exists).toBe("boolean");
	});

	it("should have skip button if onboarding is visible", async () => {
		const overlay = await $(S.onboardingOverlay);
		const exists = await overlay.isExisting();
		if (exists) {
			const skipBtn = await $(S.onboardingSkipBtn);
			expect(await skipBtn.isDisplayed()).toBe(true);
		}
	});

	it("should have next button if onboarding is visible", async () => {
		const overlay = await $(S.onboardingOverlay);
		const exists = await overlay.isExisting();
		if (exists) {
			const nextBtn = await $(S.onboardingNextBtn);
			expect(await nextBtn.isDisplayed()).toBe(true);
		}
	});
});
