import { registerTtsProvider } from "./registry.js";
import { getGcpAccessToken } from "./gcp-auth.js";

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

const DEFAULT_VOICE = "ko-KR-Neural2-A";

/**
 * Synthesize speech using Google Cloud TTS API directly.
 * Supports two auth methods:
 * - API key: passed as ?key= query parameter
 * - Service account JSON (path or content): exchanges for OAuth2 access token
 */
export async function synthesizeSpeech(
	text: string,
	apiKeyOrServiceAccount: string,
	voice?: string,
): Promise<string | null> {
	if (!text.trim()) return null;

	const voiceName = voice || DEFAULT_VOICE;
	const languageCode = voiceName.slice(0, 5); // e.g. "ko-KR"

	try {
		// Determine auth method
		const accessToken = await getGcpAccessToken(apiKeyOrServiceAccount);
		let url: string;
		let headers: Record<string, string>;

		if (accessToken) {
			// Service account → Bearer token
			url = TTS_URL;
			headers = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			};
		} else {
			// Plain API key
			url = `${TTS_URL}?key=${apiKeyOrServiceAccount}`;
			headers = { "Content-Type": "application/json" };
		}

		const response = await fetch(url, {
			method: "POST",
			headers,
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
