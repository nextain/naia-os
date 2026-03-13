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

// ── Built-in providers ──

registerTtsProviderMeta({
	id: "edge",
	name: "Microsoft Edge TTS",
	description: "Free, no API key needed. Good quality Korean/English voices.",
	requiresApiKey: false,
	isFree: true,
	voices: [
		{ id: "ko-KR-SunHiNeural", label: "SunHi (여성)", language: "ko-KR", gender: "female" },
		{ id: "ko-KR-InJoonNeural", label: "InJoon (남성)", language: "ko-KR", gender: "male" },
		{ id: "en-US-JennyNeural", label: "Jenny (Female)", language: "en-US", gender: "female" },
		{ id: "en-US-GuyNeural", label: "Guy (Male)", language: "en-US", gender: "male" },
	],
});

registerTtsProviderMeta({
	id: "google",
	name: "Google Cloud TTS",
	description: "High-quality Neural2 voices. Requires Google API key.",
	requiresApiKey: true,
	apiKeyConfigField: "googleApiKey",
	voices: [
		{ id: "ko-KR-Neural2-A", label: "Neural2-A (여성)", language: "ko-KR", gender: "female" },
		{ id: "ko-KR-Neural2-C", label: "Neural2-C (남성)", language: "ko-KR", gender: "male" },
	],
});

registerTtsProviderMeta({
	id: "openai",
	name: "OpenAI TTS",
	description: "OpenAI text-to-speech. Requires OpenAI API key.",
	requiresApiKey: true,
	apiKeyConfigField: "openaiTtsApiKey",
	voices: [
		{ id: "nova", label: "Nova", gender: "female" },
		{ id: "alloy", label: "Alloy", gender: "neutral" },
		{ id: "echo", label: "Echo", gender: "male" },
		{ id: "fable", label: "Fable", gender: "male" },
		{ id: "onyx", label: "Onyx", gender: "male" },
		{ id: "shimmer", label: "Shimmer", gender: "female" },
		{ id: "marin", label: "Marin (추천)", gender: "female" },
		{ id: "cedar", label: "Cedar (추천)", gender: "male" },
	],
});

registerTtsProviderMeta({
	id: "elevenlabs",
	name: "ElevenLabs",
	description: "Premium AI voices. Requires ElevenLabs API key.",
	requiresApiKey: true,
	apiKeyConfigField: "elevenlabsApiKey",
});

registerTtsProviderMeta({
	id: "nextain",
	name: "Naia Cloud TTS",
	description: "Chirp 3 HD voices via Naia Lab. Requires Naia account.",
	requiresApiKey: false,
	requiresNaiaKey: true,
});
