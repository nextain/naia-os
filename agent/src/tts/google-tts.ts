import { registerTtsProvider } from "./registry.js";

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

const DEFAULT_VOICE = "ko-KR-Neural2-A";

export async function synthesizeSpeech(
	text: string,
	apiKey: string,
	voice?: string,
): Promise<string | null> {
	if (!text.trim()) return null;

	const voiceName = voice || DEFAULT_VOICE;
	const languageCode = voiceName.slice(0, 5); // e.g. "ko-KR" from "ko-KR-Wavenet-A"

	try {
		const response = await fetch(`${TTS_URL}?key=${apiKey}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input: { text },
				voice: {
					languageCode,
					name: voiceName,
				},
				audioConfig: {
					audioEncoding: "MP3",
					speakingRate: 1.0,
					pitch: 0.0,
				},
			}),
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => "");
			console.error(`[google-tts] HTTP ${response.status}: ${errBody.slice(0, 200)}`);
			return null;
		}

		const data = (await response.json()) as { audioContent?: string };
		return data.audioContent ?? null;
	} catch (err) {
		console.error("[google-tts] error:", err);
		return null;
	}
}

registerTtsProvider({
	id: "google",
	name: "Google Cloud TTS",
	requiresApiKey: true,
	synthesize: (opts) => synthesizeSpeech(opts.text, opts.apiKey!, opts.voice),
});
