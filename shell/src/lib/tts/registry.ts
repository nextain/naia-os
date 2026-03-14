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
	description: "Free, no API key needed. Good quality voices for 14+ languages.",
	requiresApiKey: false,
	isFree: true,
	pricing: "Free",
	// Edge voices are fetched dynamically from Gateway — no static list needed
});

registerTtsProviderMeta({
	id: "nextain",
	name: "Naia Cloud TTS",
	description: "Cloud TTS without API key. Currently Google Chirp 3 HD, more providers coming.",
	requiresApiKey: false,
	requiresNaiaKey: true,
	pricing: "Naia credit",
	// Voices fetched dynamically via Naia gateway — supports all locales
});

registerTtsProviderMeta({
	id: "google",
	name: "Google Cloud TTS",
	description: "High-quality Neural2 + Chirp 3 HD voices. Requires Google API key.",
	requiresApiKey: true,
	apiKeyConfigField: "googleApiKey",
	pricing: "$0.016/1K 글자",
	// Voices fetched dynamically from Google API — supports all locales
	async fetchVoices(apiKey) {
		try {
			const locale = document.documentElement.lang || navigator.language || "ko-KR";
			const langCode = locale.slice(0, 5); // "ko-KR", "en-US", etc.
			const resp = await fetch(
				`https://texttospeech.googleapis.com/v1/voices?languageCode=${langCode}&key=${apiKey}`,
			);
			if (!resp.ok) return null;
			const data = await resp.json();
			const genderLabel = (g?: string) => g === "FEMALE" ? "여성" : g === "MALE" ? "남성" : "";
			const shortName = (name: string) => name.replace(new RegExp(`^${langCode}-`), "").replace(/^(Chirp3-HD-|Neural2-)/, "");
			return (data.voices ?? [])
				.filter((v: { name?: string }) => v.name?.includes("Neural2") || v.name?.includes("Chirp") || v.name?.includes("Wavenet"))
				.map((v: { name: string; ssmlGender?: string }) => ({
					id: v.name,
					label: `${shortName(v.name)}${genderLabel(v.ssmlGender) ? ` (${genderLabel(v.ssmlGender)})` : ""}`,
					language: langCode,
					gender: v.ssmlGender === "FEMALE" ? "female" as const : v.ssmlGender === "MALE" ? "male" as const : "neutral" as const,
				}));
		} catch {
			return null;
		}
	},
});

registerTtsProviderMeta({
	id: "openai",
	name: "OpenAI TTS",
	description: "OpenAI text-to-speech. All languages supported.",
	requiresApiKey: true,
	apiKeyConfigField: "openaiTtsApiKey",
	pricing: "$0.015/1K 글자",
	voices: [
		{ id: "alloy", label: "Alloy", gender: "neutral" },
		{ id: "ash", label: "Ash", gender: "male" },
		{ id: "coral", label: "Coral", gender: "female" },
		{ id: "echo", label: "Echo", gender: "male" },
		{ id: "fable", label: "Fable", gender: "male" },
		{ id: "nova", label: "Nova", gender: "female" },
		{ id: "onyx", label: "Onyx", gender: "male" },
		{ id: "sage", label: "Sage", gender: "female" },
		{ id: "shimmer", label: "Shimmer", gender: "female" },
		{ id: "ballad", label: "Ballad (gpt-4o-mini-tts)", gender: "male" },
		{ id: "verse", label: "Verse (gpt-4o-mini-tts)", gender: "male" },
		{ id: "marin", label: "Marin (gpt-4o-mini-tts)", gender: "female" },
		{ id: "cedar", label: "Cedar (gpt-4o-mini-tts)", gender: "male" },
	],
});

registerTtsProviderMeta({
	id: "elevenlabs",
	name: "ElevenLabs",
	description: "Premium AI voices. All languages supported.",
	requiresApiKey: true,
	apiKeyConfigField: "elevenlabsApiKey",
	pricing: "$0.30/1K 글자",
	// Voices fetched dynamically from ElevenLabs API
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
