import type { SttProviderMeta } from "./types";

const providers = new Map<string, SttProviderMeta>();

/** Register an STT provider's metadata. */
export function registerSttProvider(meta: SttProviderMeta): void {
	providers.set(meta.id, meta);
}

/** Get a registered STT provider by id. */
export function getSttProvider(id: string): SttProviderMeta | undefined {
	return providers.get(id);
}

/** List all registered STT providers. */
export function listSttProviders(): SttProviderMeta[] {
	return Array.from(providers.values());
}

// ── Offline providers (free, Tauri plugin) ──

registerSttProvider({
	id: "vosk",
	name: "Vosk",
	description: "Offline speech recognition. Small models (~40-80MB), real-time streaming.",
	engineType: "tauri",
	engine: "vosk",
	isOffline: true,
	supportedLanguages: [
		"ko-KR", "en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR",
		"de-DE", "ru-RU", "pt-BR", "it-IT", "vi-VN", "hi-IN",
	],
});

registerSttProvider({
	id: "whisper",
	name: "Whisper",
	description: "OpenAI Whisper (local). Higher accuracy, batch inference every 2s.",
	engineType: "tauri",
	engine: "whisper",
	isOffline: true,
	gpuAccelerated: true,
	supportedLanguages: [
		"ko-KR", "en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR",
		"de-DE", "ru-RU", "pt-BR", "it-IT", "vi-VN", "hi-IN",
		"ar-SA", "bn-IN", "id-ID",
	],
});

// ── Naia Cloud (free with Naia account) ──

registerSttProvider({
	id: "nextain",
	name: "Naia Cloud STT",
	description: "Cloud STT without API key. Currently Google Cloud STT, more providers coming.",
	engineType: "api",
	isOffline: false,
	requiresNaiaKey: true,
	supportedLanguages: [
		"ko-KR", "en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR",
		"de-DE", "ru-RU", "pt-BR", "it-IT", "vi-VN", "hi-IN",
	],
});

// ── API-based providers (paid, API key required) ──

registerSttProvider({
	id: "google",
	name: "Google Cloud STT",
	description: "Google Cloud Speech-to-Text API. High accuracy, streaming support.",
	engineType: "api",
	isOffline: false,
	requiresApiKey: true,
	apiKeyConfigField: "googleApiKey",
	supportedLanguages: [
		"ko-KR", "en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR",
		"de-DE", "ru-RU", "pt-BR", "it-IT", "vi-VN", "hi-IN",
		"ar-SA", "bn-IN", "id-ID",
	],
});

registerSttProvider({
	id: "elevenlabs",
	name: "ElevenLabs STT",
	description: "ElevenLabs speech-to-text. Requires ElevenLabs API key.",
	engineType: "api",
	isOffline: false,
	requiresApiKey: true,
	apiKeyConfigField: "elevenlabsApiKey",
	supportedLanguages: [
		"ko-KR", "en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR",
		"de-DE", "ru-RU",
	],
});
