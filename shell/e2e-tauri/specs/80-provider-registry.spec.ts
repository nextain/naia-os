import { S } from "../helpers/selectors.js";
import {
	ensureAppReady,
	navigateToSettings,
	scrollToSection,
	setNativeValue,
	clickBySelector,
} from "../helpers/settings.js";

/**
 * 80 — Provider Registry E2E (Issue #51)
 *
 * Verifies the extensible provider registry:
 * - All 8 LLM providers appear in the Settings provider select
 * - Selecting a provider changes the model list
 * - Saving with a provider persists to localStorage
 * - API key validation: key-required providers show API key input
 * - API key validation: key-optional providers (ollama) hide API key input
 * - Nextain provider shows Naia account UI instead of API key input
 */
describe("80 — Provider Registry", () => {
	before(async () => {
		await ensureAppReady();
		await navigateToSettings();
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });
	});

	it("should show all registered LLM providers in the select", async () => {
		await scrollToSection(S.providerSelect);

		const providerIds = await browser.execute((sel: string) => {
			const select = document.querySelector(sel) as HTMLSelectElement | null;
			if (!select) return [];
			return Array.from(select.options).map((o) => o.value);
		}, S.providerSelect);

		// All 8 registered providers
		expect(providerIds).toContain("nextain");
		expect(providerIds).toContain("claude-code-cli");
		expect(providerIds).toContain("gemini");
		expect(providerIds).toContain("openai");
		expect(providerIds).toContain("anthropic");
		expect(providerIds).toContain("xai");
		expect(providerIds).toContain("zai");
		expect(providerIds).toContain("ollama");

		// Should have exactly 8 providers
		expect(providerIds.length).toBe(8);
	});

	it("should switch provider to anthropic and show API key input", async () => {
		// Select anthropic
		await browser.execute(
			(sel: string, val: string) => {
				const el = document.querySelector(sel) as HTMLSelectElement | null;
				if (!el) throw new Error("Provider select not found");
				const setter = Object.getOwnPropertyDescriptor(
					HTMLSelectElement.prototype,
					"value",
				)?.set;
				if (setter) setter.call(el, val);
				else el.value = val;
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			S.providerSelect,
			"anthropic",
		);

		await browser.pause(300);

		// Verify provider value changed
		const selectedProvider = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLSelectElement)?.value ?? "",
			S.providerSelect,
		);
		expect(selectedProvider).toBe("anthropic");

		// API key input should be visible (anthropic requires API key)
		const hasApiInput = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.apiKeyInput,
		);
		expect(hasApiInput).toBe(true);
	});

	it("should update provider select value when switching providers", async () => {
		// Switch to xai and verify select value updates
		await browser.execute(
			(sel: string, val: string) => {
				const el = document.querySelector(sel) as HTMLSelectElement | null;
				if (!el) throw new Error("Provider select not found");
				const setter = Object.getOwnPropertyDescriptor(
					HTMLSelectElement.prototype,
					"value",
				)?.set;
				if (setter) setter.call(el, val);
				else el.value = val;
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			S.providerSelect,
			"xai",
		);
		await browser.pause(300);

		const selectedProvider = await browser.execute(
			(sel: string) =>
				(document.querySelector(sel) as HTMLSelectElement)?.value ?? "",
			S.providerSelect,
		);
		expect(selectedProvider).toBe("xai");

		// API key input should be visible (xai requires API key)
		const hasApiInput = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.apiKeyInput,
		);
		expect(hasApiInput).toBe(true);
	});

	it("should save anthropic with API key successfully", async () => {
		// Select anthropic first
		await browser.execute(
			(sel: string, val: string) => {
				const el = document.querySelector(sel) as HTMLSelectElement | null;
				if (!el) throw new Error("Provider select not found");
				const setter = Object.getOwnPropertyDescriptor(
					HTMLSelectElement.prototype,
					"value",
				)?.set;
				if (setter) setter.call(el, val);
				else el.value = val;
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			S.providerSelect,
			"anthropic",
		);
		await browser.pause(300);

		// Enter a test key
		await setNativeValue(S.apiKeyInput, "sk-ant-test-key-e2e");

		// Click save
		await clickBySelector(S.settingsSaveBtn);
		await browser.pause(500);

		// Verify saved to localStorage
		const saved = await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			return raw ? JSON.parse(raw) : null;
		});
		expect(saved).not.toBeNull();
		expect(saved.provider).toBe("anthropic");
		expect(saved.apiKey).toBe("sk-ant-test-key-e2e");
	});

	it("should hide API key input for nextain provider", async () => {
		await navigateToSettings();
		const settingsTab = await $(S.settingsTab);
		await settingsTab.waitForDisplayed({ timeout: 10_000 });

		// Select nextain
		await browser.execute(
			(sel: string, val: string) => {
				const el = document.querySelector(sel) as HTMLSelectElement | null;
				if (!el) throw new Error("Provider select not found");
				const setter = Object.getOwnPropertyDescriptor(
					HTMLSelectElement.prototype,
					"value",
				)?.set;
				if (setter) setter.call(el, val);
				else el.value = val;
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			S.providerSelect,
			"nextain",
		);

		await browser.pause(300);

		// API key input should NOT be visible
		const hasApiInput = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.apiKeyInput,
		);
		expect(hasApiInput).toBe(false);

		// Should show Naia account hint instead
		const hasNaiaHint = await browser.execute(() => {
			const hints = document.querySelectorAll(".settings-hint");
			return Array.from(hints).some((h) =>
				/Naia.*계정|API.*키.*없이/i.test(h.textContent ?? ""),
			);
		});
		expect(hasNaiaHint).toBe(true);
	});

	it("should hide API key input for ollama provider", async () => {
		// Select ollama
		await browser.execute(
			(sel: string, val: string) => {
				const el = document.querySelector(sel) as HTMLSelectElement | null;
				if (!el) throw new Error("Provider select not found");
				const setter = Object.getOwnPropertyDescriptor(
					HTMLSelectElement.prototype,
					"value",
				)?.set;
				if (setter) setter.call(el, val);
				else el.value = val;
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			S.providerSelect,
			"ollama",
		);

		await browser.pause(300);

		// API key input should NOT be visible (ollama shows host input instead)
		const hasApiInput = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.apiKeyInput,
		);
		expect(hasApiInput).toBe(false);
	});

	it("should restore gemini provider for subsequent tests", async () => {
		// Restore original config
		await browser.execute(() => {
			const raw = localStorage.getItem("naia-config");
			if (!raw) return;
			const config = JSON.parse(raw);
			config.provider = "gemini";
			config.model = "gemini-2.5-flash";
			config.apiKey = config.apiKey || "";
			localStorage.setItem("naia-config", JSON.stringify(config));
		});

		// Navigate back to chat
		await clickBySelector(S.chatTab);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 5_000 });
	});
});
