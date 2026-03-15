import { registerTtsProvider } from "./registry.js";
import type { TtsSynthesizeResult } from "./types.js";

const DEFAULT_VOICE = "nova";

// Voices only available on gpt-4o-mini-tts (not tts-1/tts-1-hd)
const MINI_TTS_ONLY_VOICES = new Set([
	"ballad",
	"cedar",
	"marin",
	"verse",
]);

function pickModel(voice: string): string {
	return MINI_TTS_ONLY_VOICES.has(voice) ? "gpt-4o-mini-tts" : "tts-1";
}

/**
 * Synthesize speech using OpenAI TTS API.
 */
export async function synthesizeOpenAISpeech(
	text: string,
	apiKey: string,
	voice?: string,
): Promise<TtsSynthesizeResult | null> {
	if (!text.trim() || !apiKey) return null;

	const selectedVoice = voice || DEFAULT_VOICE;
	const model = pickModel(selectedVoice);

	try {
		const response = await fetch("https://api.openai.com/v1/audio/speech", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				input: text,
				voice: selectedVoice,
				response_format: "mp3",
			}),
		});

		if (!response.ok) return null;

		const buf = Buffer.from(await response.arrayBuffer());
		if (buf.length === 0) return null;
		return { audio: buf.toString("base64") };
	} catch {
		return null;
	}
}

registerTtsProvider({
	id: "openai",
	name: "OpenAI TTS",
	requiresApiKey: true,
	synthesize: (opts) => synthesizeOpenAISpeech(opts.text, opts.apiKey!, opts.voice),
});
