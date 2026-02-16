// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasApiKey, loadConfig, saveConfig } from "../config";

describe("config", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("loadConfig returns null when not set", () => {
		expect(loadConfig()).toBeNull();
	});

	it("saveConfig stores and loadConfig retrieves", () => {
		saveConfig({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "test-key-123",
		});
		const config = loadConfig();
		expect(config).not.toBeNull();
		expect(config!.provider).toBe("gemini");
		expect(config!.model).toBe("gemini-2.5-flash");
		expect(config!.apiKey).toBe("test-key-123");
	});

	it("hasApiKey returns false when not set", () => {
		expect(hasApiKey()).toBe(false);
	});

	it("hasApiKey returns true after saving config", () => {
		saveConfig({
			provider: "xai",
			model: "grok-3-mini",
			apiKey: "xai-key",
		});
		expect(hasApiKey()).toBe(true);
	});

	it("hasApiKey returns false for empty apiKey", () => {
		saveConfig({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "",
		});
		expect(hasApiKey()).toBe(false);
	});
});
