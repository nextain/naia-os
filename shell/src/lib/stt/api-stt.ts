/**
 * API-based STT session — captures audio via browser MediaStream,
 * sends to cloud API (Google Cloud STT / ElevenLabs), returns transcripts.
 *
 * Inspired by project-airi's TranscriptionProvider pattern.
 */
import { Logger } from "../logger";
import type { SttResult, SttSession } from "./types";

interface ApiSttOptions {
	provider: "google" | "elevenlabs" | "nextain";
	apiKey: string;
	language: string;
}

/**
 * Create an API-based STT session.
 * Uses browser MediaRecorder to capture audio, sends chunks to cloud API.
 */
export function createApiSttSession(options: ApiSttOptions): SttSession {
	const { provider, apiKey, language } = options;
	let mediaStream: MediaStream | null = null;
	let mediaRecorder: MediaRecorder | null = null;
	let resultCallbacks: ((result: SttResult) => void)[] = [];
	let errorCallbacks: ((error: { code: string; message: string }) => void)[] = [];
	let stopped = false;
	let recordingInterval: ReturnType<typeof setInterval> | null = null;

	async function transcribeChunk(audioBlob: Blob): Promise<string | null> {
		try {
			if (provider === "google") {
				return await transcribeGoogle(audioBlob, apiKey, language);
			} else if (provider === "nextain") {
				return await transcribeNextain(audioBlob, apiKey, language);
			} else if (provider === "elevenlabs") {
				return await transcribeElevenLabs(audioBlob, apiKey, language);
			}
			return null;
		} catch (err) {
			Logger.warn("api-stt", `${provider} transcription error`, { error: String(err) });
			for (const cb of errorCallbacks) cb({ code: "API_ERROR", message: String(err) });
			return null;
		}
	}

	return {
		async start() {
			stopped = false;
			try {
				mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			} catch (err) {
				for (const cb of errorCallbacks) cb({ code: "MIC_ERROR", message: String(err) });
				throw err;
			}

			const chunks: Blob[] = [];

			function createRecorder(stream: MediaStream): MediaRecorder {
				const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
				recorder.ondataavailable = (e) => {
					if (e.data.size > 0) chunks.push(e.data);
				};
				recorder.onstop = async () => {
					if (chunks.length === 0 || stopped) return;
					const blob = new Blob(chunks, { type: "audio/webm" });
					chunks.length = 0;
					const transcript = await transcribeChunk(blob);
					if (transcript && transcript.trim()) {
						for (const cb of resultCallbacks) {
							cb({ transcript: transcript.trim(), isFinal: true });
						}
					}
				};
				return recorder;
			}

			mediaRecorder = createRecorder(mediaStream);
			mediaRecorder.start();

			// Periodically stop/restart to send chunks every 3s
			recordingInterval = setInterval(() => {
				if (mediaRecorder && mediaRecorder.state === "recording" && !stopped) {
					mediaRecorder.stop();
					setTimeout(() => {
						if (!stopped && mediaStream?.active) {
							mediaRecorder = createRecorder(mediaStream!);
							mediaRecorder.start();
						}
					}, 100);
				}
			}, 3000);

			Logger.info("api-stt", `${provider} STT started`, { language });
		},

		async stop() {
			stopped = true;
			if (recordingInterval) {
				clearInterval(recordingInterval);
				recordingInterval = null;
			}
			if (mediaRecorder && mediaRecorder.state !== "inactive") {
				mediaRecorder.stop();
			}
			if (mediaStream) {
				for (const track of mediaStream.getTracks()) track.stop();
				mediaStream = null;
			}
			Logger.info("api-stt", `${provider} STT stopped`);
		},

		onResult(callback) {
			resultCallbacks.push(callback);
			return () => {
				resultCallbacks = resultCallbacks.filter((cb) => cb !== callback);
			};
		},

		onError(callback) {
			errorCallbacks.push(callback);
			return () => {
				errorCallbacks = errorCallbacks.filter((cb) => cb !== callback);
			};
		},
	};
}

// ── Google Cloud Speech-to-Text ──

async function transcribeGoogle(audio: Blob, apiKey: string, language: string): Promise<string | null> {
	const base64 = await blobToBase64(audio);

	const response = await fetch(
		`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				config: {
					encoding: "WEBM_OPUS",
					sampleRateHertz: 48000,
					languageCode: language,
					model: "latest_long",
					enableAutomaticPunctuation: true,
				},
				audio: { content: base64 },
			}),
		},
	);

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Google STT HTTP ${response.status}: ${text}`);
	}

	const data = await response.json();
	const results = data.results ?? [];
	return results
		.map((r: { alternatives?: { transcript?: string }[] }) => r.alternatives?.[0]?.transcript ?? "")
		.join(" ")
		.trim() || null;
}

// ── Naia Cloud STT (via any-llm gateway → Google Cloud STT) ──

async function transcribeNextain(audio: Blob, naiaKey: string, language: string): Promise<string | null> {
	const formData = new FormData();
	formData.append("file", audio, "audio.webm");
	formData.append("language", language);

	const response = await fetch("https://naia.nextain.io/api/gateway/v1/audio/transcriptions", {
		method: "POST",
		headers: { "X-AnyLLM-Key": naiaKey },
		body: formData,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Naia Cloud STT HTTP ${response.status}: ${text}`);
	}

	const data = await response.json();
	return data.text?.trim() || null;
}

// ── ElevenLabs Speech-to-Text ──

async function transcribeElevenLabs(audio: Blob, apiKey: string, language: string): Promise<string | null> {
	const formData = new FormData();
	formData.append("audio", audio, "audio.webm");
	formData.append("language_code", language.split("-")[0]); // "ko-KR" → "ko"

	const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
		method: "POST",
		headers: { "xi-api-key": apiKey },
		body: formData,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`ElevenLabs STT HTTP ${response.status}: ${text}`);
	}

	const data = await response.json();
	return data.text?.trim() || null;
}

// ── Utility ──

async function blobToBase64(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
