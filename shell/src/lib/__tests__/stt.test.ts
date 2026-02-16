// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("transcribeAudio", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends audio to Google STT API and returns transcript", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [
					{
						alternatives: [{ transcript: "안녕하세요", confidence: 0.95 }],
					},
				],
			}),
		});

		const { transcribeAudio } = await import("../stt.js");
		const audioBlob = new Blob(["fake-audio"], { type: "audio/webm" });
		const result = await transcribeAudio(audioBlob, "test-api-key");

		expect(result).toBe("안녕하세요");
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("speech.googleapis.com"),
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("returns empty string when no results", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		const { transcribeAudio } = await import("../stt.js");
		const audioBlob = new Blob(["fake-audio"], { type: "audio/webm" });
		const result = await transcribeAudio(audioBlob, "test-api-key");

		expect(result).toBe("");
	});

	it("returns empty string on API error", async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
		});

		const { transcribeAudio } = await import("../stt.js");
		const audioBlob = new Blob(["fake-audio"], { type: "audio/webm" });
		const result = await transcribeAudio(audioBlob, "test-api-key");

		expect(result).toBe("");
	});
});
