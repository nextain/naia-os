import { S } from "../helpers/selectors.js";
import { navigateToSettings, safeRefresh } from "../helpers/settings.js";

/** Locales with formal/informal distinction — must match FORMALITY_LOCALES in persona.ts */
const FORMALITY_LOCALES = ["ko", "ja", "de", "fr", "es", "hi", "vi", "ru", "pt", "id", "ar"];
/** Locales WITHOUT formal/informal distinction */
const NON_FORMALITY_LOCALES = ["en", "zh", "bn"];

/** Helper: set locale (and optionally speechStyle) in config and refresh */
async function setLocale(locale: string, speechStyle?: string) {
	await browser.execute((loc: string, ss?: string) => {
		const raw = localStorage.getItem("naia-config");
		const config = raw ? JSON.parse(raw) : {};
		config.locale = loc;
		if (ss) config.speechStyle = ss;
		localStorage.setItem("naia-config", JSON.stringify(config));
	}, locale, speechStyle);
	await safeRefresh();
	await browser.pause(2000);
}

/** Helper: check if speechStyle select is visible */
async function findSpeechStyleSelect() {
	const el = await $(S.speechStyleSelect);
	if (await el.isExisting()) return el;
	return undefined;
}

describe("54 — Locale affects system prompt config", () => {
	before(async () => {
		await safeRefresh();
		await browser.pause(2000);
	});

	it("stores locale 'en' in config correctly", async () => {
		await setLocale("en");
		const locale = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			return config.locale;
		});
		expect(locale).toBe("en");
	});

	it("stores locale 'ko' in config correctly", async () => {
		await setLocale("ko");
		const locale = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			return config.locale;
		});
		expect(locale).toBe("ko");
	});

	// Test: speechStyle fields HIDDEN for non-formality locales
	for (const locale of NON_FORMALITY_LOCALES) {
		it(`speechStyle/honorific hidden for non-formality locale '${locale}'`, async () => {
			await setLocale(locale);
			await navigateToSettings();
			const speechSelect = await findSpeechStyleSelect();
			expect(speechSelect).toBeUndefined();
		});
	}

	// Test: speechStyle fields VISIBLE for formality locales
	for (const locale of FORMALITY_LOCALES) {
		it(`speechStyle/honorific visible for formality locale '${locale}'`, async () => {
			await setLocale(locale, "casual");
			await navigateToSettings();
			const speechSelect = await findSpeechStyleSelect();
			expect(speechSelect).toBeDefined();
		});
	}

	// Test: speechStyle stores "casual"/"formal" (not legacy Korean values)
	it("speechStyle stores normalized values", async () => {
		await setLocale("ja", "casual");
		await navigateToSettings();

		const speechSelect = await findSpeechStyleSelect();
		expect(speechSelect).toBeDefined();
		const val = await speechSelect!.getValue();
		expect(val).toBe("casual");
	});

	// Test: legacy "반말" value is migrated on startup
	it("migrates legacy speechStyle values on startup", async () => {
		// Set legacy value directly
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			config.speechStyle = "반말";
			config.locale = "ko";
			localStorage.setItem("naia-config", JSON.stringify(config));
		});
		await safeRefresh();
		await browser.pause(2000);

		// After refresh (migration runs on startup), value should be normalized
		const speechStyle = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			const config = raw ? JSON.parse(raw) : {};
			return config.speechStyle;
		});
		expect(speechStyle).toBe("casual");
	});
});
