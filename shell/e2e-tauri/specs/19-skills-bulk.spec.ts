import { S } from "../helpers/selectors.js";

describe("19 — skills bulk migration", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should show at least 55 total skills in skills tab", async () => {
		// Navigate to Skills tab
		const skillsTab = await $(S.skillsTab);
		await skillsTab.click();
		await browser.pause(500);

		// Count total skill items
		const count = await browser.execute(() => {
			return document.querySelectorAll(".skill-item").length;
		});

		expect(count).toBeGreaterThanOrEqual(55);
	});

	it("should find github skill via search", async () => {
		const searchInput = await $(".skills-search input");
		await searchInput.setValue("github");
		await browser.pause(300);

		const results = await browser.execute(() => {
			return document.querySelectorAll(".skill-item").length;
		});
		expect(results).toBeGreaterThan(0);
	});

	it("should find spotify skill via search", async () => {
		const searchInput = await $(".skills-search input");
		await searchInput.clearValue();
		await searchInput.setValue("spotify");
		await browser.pause(300);

		const results = await browser.execute(() => {
			return document.querySelectorAll(".skill-item").length;
		});
		expect(results).toBeGreaterThan(0);
	});

	it("should find notion skill via search", async () => {
		const searchInput = await $(".skills-search input");
		await searchInput.clearValue();
		await searchInput.setValue("notion");
		await browser.pause(300);

		const results = await browser.execute(() => {
			return document.querySelectorAll(".skill-item").length;
		});
		expect(results).toBeGreaterThan(0);

		// Go back to chat tab
		const chatTab = await $(".chat-tab:nth-child(1)");
		await chatTab.click();
	});
});
