import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri invoke
const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("./logger", () => ({ Logger: { warn: vi.fn() } }));

import { syncToOpenClaw } from "../openclaw-sync";

beforeEach(() => {
	mockInvoke.mockClear();
});

describe("syncToOpenClaw", () => {
	it("passes provider and model to Tauri command", async () => {
		await syncToOpenClaw("gemini", "gemini-3-flash-preview");
		expect(mockInvoke).toHaveBeenCalledWith(
			"sync_openclaw_config",
			expect.objectContaining({
				params: expect.objectContaining({
					provider: "gemini",
					model: "gemini-3-flash-preview",
				}),
			}),
		);
	});

	it("passes TTS settings to Tauri command", async () => {
		await syncToOpenClaw(
			"gemini",
			"gemini-3-flash-preview",
			undefined, // apiKey
			undefined, // persona
			undefined, // agentName
			undefined, // userName
			undefined, // systemPrompt
			undefined, // locale
			undefined, // discordDmChannelId
			undefined, // discordDefaultUserId
			"edge", // ttsProvider
			"ko-KR-SunHiNeural", // ttsVoice
			"inbound", // ttsAuto
			"final", // ttsMode
		);

		const callArgs = mockInvoke.mock.calls[0];
		const params = callArgs[1].params;
		expect(params.tts_provider).toBe("edge");
		expect(params.tts_voice).toBe("ko-KR-SunHiNeural");
		expect(params.tts_auto).toBe("inbound");
		expect(params.tts_mode).toBe("final");
	});

	it("sends null for omitted TTS fields", async () => {
		await syncToOpenClaw("gemini", "gemini-3-flash-preview");

		const callArgs = mockInvoke.mock.calls[0];
		const params = callArgs[1].params;
		expect(params.tts_provider).toBeNull();
		expect(params.tts_voice).toBeNull();
		expect(params.tts_auto).toBeNull();
		expect(params.tts_mode).toBeNull();
	});
});
