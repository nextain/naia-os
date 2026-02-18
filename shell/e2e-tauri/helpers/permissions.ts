import { S } from "./selectors.js";

/**
 * Poll for permission modals and auto-approve them (click "Always").
 * Returns a dispose function to stop polling.
 */
export function autoApprovePermissions(): { dispose: () => void } {
	let running = true;

	const poll = async () => {
		while (running) {
			try {
				const btn = await $(S.permissionAlways);
				if (await btn.isDisplayed()) {
					await btn.click();
					await browser.pause(200);
				}
			} catch {
				// Element not found — that's expected
			}
			await browser.pause(500);
		}
	};

	void poll();

	return {
		dispose() {
			running = false;
		},
	};
}
