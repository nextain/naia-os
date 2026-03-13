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

// ── Built-in providers ──

registerSttProvider({
	id: "vosk",
	name: "Vosk",
	description: "Offline speech recognition. Small models (~40-80MB), real-time streaming.",
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
	engine: "whisper",
	isOffline: true,
	gpuAccelerated: true,
	supportedLanguages: [
		"ko-KR", "en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR",
		"de-DE", "ru-RU", "pt-BR", "it-IT", "vi-VN", "hi-IN",
		"ar-SA", "bn-IN", "id-ID",
	],
});
