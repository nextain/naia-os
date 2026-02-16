import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Google TTS", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls Google TTS API and returns base64 audio", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				audioContent: "SGVsbG8gV29ybGQ=", // base64 "Hello World"
			}),
		});

		const { synthesizeSpeech } = await import("../tts/google-tts.js");
		const result = await synthesizeSpeech("안녕하세요", "test-api-key");

		expect(result).toBe("SGVsbG8gV29ybGQ=");
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("texttospeech.googleapis.com"),
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("returns null for empty text", async () => {
		const { synthesizeSpeech } = await import("../tts/google-tts.js");
		const result = await synthesizeSpeech("", "test-api-key");
		expect(result).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("returns null on API error", async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			statusText: "Bad Request",
		});

		const { synthesizeSpeech } = await import("../tts/google-tts.js");
		const result = await synthesizeSpeech("테스트", "bad-key");
		expect(result).toBeNull();
	});
});
