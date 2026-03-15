/**
 * Voice Validity Auto-Test
 *
 * Verifies that registered TTS voices actually produce audio.
 * Tests each provider with its first voice to catch broken/deprecated voices.
 *
 * Run:
 *   OPENAI_API_KEY=... ELEVENLABS_API_KEY=... pnpm exec vitest run src/__tests__/tts-voice-validity.test.ts
 */
import { describe, expect, it } from "vitest";
import { synthesizeEdgeSpeech } from "../tts/edge-tts.js";
import { synthesizeOpenAISpeech } from "../tts/openai-tts.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const TEST_TEXT = "안녕하세요.";

describe("Voice Validity — verify voices produce audio", () => {
	// ── Edge TTS voices ──
	describe("Edge TTS", () => {
		const edgeVoices = [
			"ko-KR-SunHiNeural",
			"ko-KR-InJoonNeural",
			"en-US-JennyNeural",
			"en-US-GuyNeural",
		];

		for (const voice of edgeVoices) {
			it.skipIf(process.env.CI)(`${voice} produces audio`, async () => {
				const result = await synthesizeEdgeSpeech(TEST_TEXT, voice);
				expect(result).not.toBeNull();
				expect(result!.audio.length).toBeGreaterThan(100);
			}, 15000);
		}
	});

	// ── OpenAI TTS voices (tts-1 compatible) ──
	describe("OpenAI TTS", () => {
		const tts1Voices = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

		for (const voice of tts1Voices) {
			it.skipIf(!OPENAI_API_KEY)(`${voice} produces audio`, async () => {
				const result = await synthesizeOpenAISpeech(TEST_TEXT, OPENAI_API_KEY, voice);
				expect(result).not.toBeNull();
				expect(result!.audio.length).toBeGreaterThan(100);
			}, 30000);
		}
	});

	// ── OpenAI gpt-4o-mini-tts only voices ──
	describe("OpenAI TTS (gpt-4o-mini-tts)", () => {
		const miniVoices = ["ballad", "verse", "marin", "cedar"];

		for (const voice of miniVoices) {
			it.skipIf(!OPENAI_API_KEY)(`${voice} produces audio (gpt-4o-mini-tts)`, async () => {
				const result = await synthesizeOpenAISpeech(TEST_TEXT, OPENAI_API_KEY, voice);
				expect(result).not.toBeNull();
				expect(result!.audio.length).toBeGreaterThan(100);
			}, 30000);
		}
	});

	// ── Google Neural2 voices ──
	// Requires Google TTS API key — not tested here (uses gateway proxy in production)

	// ── ElevenLabs voices ──
	describe("ElevenLabs", () => {
		it.skipIf(!ELEVENLABS_API_KEY)("default voice produces audio", async () => {
			// ElevenLabs requires a voice_id, test with API to fetch first available
			const resp = await fetch("https://api.elevenlabs.io/v1/voices?page_size=1", {
				headers: { "xi-api-key": ELEVENLABS_API_KEY },
			});
			if (!resp.ok) return;
			const data = await resp.json();
			const voiceId = data.voices?.[0]?.voice_id;
			if (!voiceId) return;

			const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
				method: "POST",
				headers: {
					"xi-api-key": ELEVENLABS_API_KEY,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text: TEST_TEXT,
					model_id: "eleven_multilingual_v2",
				}),
			});
			expect(ttsResp.ok).toBe(true);
			const buf = await ttsResp.arrayBuffer();
			expect(buf.byteLength).toBeGreaterThan(100);
		}, 30000);
	});
});
