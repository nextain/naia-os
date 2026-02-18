import { S } from "../helpers/selectors.js";

describe("01 — App Launch", () => {
	it("should display the app root", async () => {
		const appRoot = await $(S.appRoot);
		await appRoot.waitForDisplayed({ timeout: 30_000 });
	});

	it("should clear localStorage and reload to trigger settings modal", async () => {
		await browser.execute(() => localStorage.removeItem("cafelua-config"));
		await browser.refresh();

		// After clearing config, settings modal should appear
		const modal = await $(S.settingsModal);
		await modal.waitForDisplayed({ timeout: 30_000 });
	});
});
