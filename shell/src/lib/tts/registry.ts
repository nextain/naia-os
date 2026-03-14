import type { TtsProviderMeta } from "./types";

const providers = new Map<string, TtsProviderMeta>();

/** Register a TTS provider's metadata. */
export function registerTtsProviderMeta(meta: TtsProviderMeta): void {
	providers.set(meta.id, meta);
}

/** Get a registered TTS provider by id. */
export function getTtsProviderMeta(id: string): TtsProviderMeta | undefined {
	return providers.get(id);
}

/** List all registered TTS providers. */
export function listTtsProviderMetas(): TtsProviderMeta[] {
	return Array.from(providers.values());
}

// ── Built-in providers (order: free → Naia → paid) ──

registerTtsProviderMeta({
	id: "edge",
	name: "Microsoft Edge TTS",
	description: "Free, no API key needed. Good quality Korean/English voices.",
	requiresApiKey: false,
	isFree: true,
	pricing: "Free",
	voices: [
		{ id: "ko-KR-SunHiNeural", label: "SunHi (여성)", language: "ko-KR", gender: "female" },
		{ id: "ko-KR-InJoonNeural", label: "InJoon (남성)", language: "ko-KR", gender: "male" },
		{ id: "en-US-JennyNeural", label: "Jenny (Female)", language: "en-US", gender: "female" },
		{ id: "en-US-GuyNeural", label: "Guy (Male)", language: "en-US", gender: "male" },
	],
});

registerTtsProviderMeta({
	id: "nextain",
	name: "Naia Cloud TTS",
	description: "Cloud TTS without API key. Currently Google Chirp 3 HD, more providers coming.",
	requiresApiKey: false,
	requiresNaiaKey: true,
	pricing: "Naia credit",
	voices: [
		{ id: "Kore", label: "Kore (여성, 차분)", gender: "female" },
		{ id: "Puck", label: "Puck (남성, 활발)", gender: "male" },
		{ id: "Charon", label: "Charon (남성)", gender: "male" },
		{ id: "Aoede", label: "Aoede (여성)", gender: "female" },
		{ id: "Fenrir", label: "Fenrir (남성)", gender: "male" },
		{ id: "Leda", label: "Leda (여성)", gender: "female" },
		{ id: "Orus", label: "Orus (남성)", gender: "male" },
		{ id: "Zephyr", label: "Zephyr (중성)", gender: "neutral" },
	],
});

registerTtsProviderMeta({
	id: "google",
	name: "Google Cloud TTS",
	description: "High-quality Neural2 voices. Requires Google API key.",
	requiresApiKey: true,
	apiKeyConfigField: "googleApiKey",
	pricing: "$16/1M chars",
	voices: [
		{ id: "ko-KR-Neural2-A", label: "Neural2-A (여성)", language: "ko-KR", gender: "female" },
		{ id: "ko-KR-Neural2-B", label: "Neural2-B (여성)", language: "ko-KR", gender: "female" },
		{ id: "ko-KR-Neural2-C", label: "Neural2-C (남성)", language: "ko-KR", gender: "male" },
	],
	async fetchVoices(apiKey) {
		try {
			const resp = await fetch(
				`https://texttospeech.googleapis.com/v1/voices?languageCode=ko-KR&key=${apiKey}`,
			);
			if (!resp.ok) return null;
			const data = await resp.json();
			return (data.voices ?? [])
				.filter((v: { name?: string }) => v.name?.includes("Neural2") || v.name?.includes("Chirp"))
				.map((v: { name: string; ssmlGender?: string }) => ({
					id: v.name,
					label: v.name.replace("ko-KR-", ""),
					language: "ko-KR",
					gender: v.ssmlGender === "FEMALE" ? "female" as const : "male" as const,
				}));
		} catch {
			return null;
		}
	},
});

registerTtsProviderMeta({
	id: "openai",
	name: "OpenAI TTS",
	description: "OpenAI text-to-speech. Requires OpenAI API key.",
	requiresApiKey: true,
	apiKeyConfigField: "openaiTtsApiKey",
	pricing: "$15/1M chars",
	voices: [
		// All models (tts-1, tts-1-hd, gpt-4o-mini-tts)
		{ id: "alloy", label: "Alloy", gender: "neutral" },
		{ id: "ash", label: "Ash", gender: "male" },
		{ id: "coral", label: "Coral", gender: "female" },
		{ id: "echo", label: "Echo", gender: "male" },
		{ id: "fable", label: "Fable", gender: "male" },
		{ id: "nova", label: "Nova", gender: "female" },
		{ id: "onyx", label: "Onyx", gender: "male" },
		{ id: "sage", label: "Sage", gender: "female" },
		{ id: "shimmer", label: "Shimmer", gender: "female" },
		// gpt-4o-mini-tts only
		{ id: "ballad", label: "Ballad (gpt-4o-mini-tts)", gender: "male" },
		{ id: "verse", label: "Verse (gpt-4o-mini-tts)", gender: "male" },
		{ id: "marin", label: "Marin (gpt-4o-mini-tts)", gender: "female" },
		{ id: "cedar", label: "Cedar (gpt-4o-mini-tts)", gender: "male" },
	],
});

registerTtsProviderMeta({
	id: "elevenlabs",
	name: "ElevenLabs",
	description: "Premium AI voices. Requires ElevenLabs API key.",
	requiresApiKey: true,
	apiKeyConfigField: "elevenlabsApiKey",
	pricing: "$0.30/1K chars",
	async fetchVoices(apiKey) {
		try {
			const resp = await fetch("https://api.elevenlabs.io/v1/voices?page_size=50", {
				headers: { "xi-api-key": apiKey },
			});
			if (!resp.ok) return null;
			const data = await resp.json();
			return (data.voices ?? []).map((v: { voice_id: string; name: string; labels?: { gender?: string } }) => ({
				id: v.voice_id,
				label: v.name,
				gender: v.labels?.gender === "female" ? "female" as const
					: v.labels?.gender === "male" ? "male" as const
					: "neutral" as const,
			}));
		} catch {
			return null;
		}
	},
});
