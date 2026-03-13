import { defineProvider } from "../registry";

export const whisperProvider = defineProvider({
	id: "whisper",
	type: "stt",
	name: "Whisper",
	description: "OpenAI Whisper local model (GPU recommended)",
	order: 2,
	capabilities: {
		requiresApiKey: false,
		requiresModel: true,
		gpuRecommended: true,
		runtime: "rust",
	},
	configFields: [],
	supportedLanguages: [
		"ko-KR", "en-US", "ja-JP", "zh-CN", "fr-FR", "de-DE",
		"ru-RU", "es-ES", "pt-BR", "hi-IN", "ar-SA", "vi-VN",
		"id-ID", "bn-IN",
	],
});
