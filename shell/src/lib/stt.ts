import { Logger } from "./logger";

const STT_URL = "https://speech.googleapis.com/v1/speech:recognize";

/**
 * Transcribe an audio blob using Google Cloud Speech-to-Text API.
 * Returns the recognized text, or empty string on failure.
 */
export async function transcribeAudio(
	audioBlob: Blob,
	apiKey: string,
): Promise<string> {
	try {
		const arrayBuffer = await audioBlob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let binary = "";
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64Audio = btoa(binary);

		// Detect format from blob type
		const isWav = audioBlob.type.includes("wav");
		const encoding = isWav ? "LINEAR16" : "WEBM_OPUS";
		const sampleRateHertz = isWav ? 16000 : 48000;

		const response = await fetch(`${STT_URL}?key=${apiKey}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				config: {
					encoding,
					sampleRateHertz,
					languageCode: "ko-KR",
				},
				audio: { content: base64Audio },
			}),
		});

		if (!response.ok) return "";

		const data = (await response.json()) as {
			results?: { alternatives?: { transcript?: string }[] }[];
		};
		return data.results?.[0]?.alternatives?.[0]?.transcript ?? "";
	} catch (err) {
		Logger.warn("STT", "Transcription failed", { error: String(err) });
		return "";
	}
}
