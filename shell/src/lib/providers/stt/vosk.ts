import { defineProvider } from "../registry";

export const voskProvider = defineProvider({
	id: "vosk",
	type: "stt",
	name: "Vosk",
	description: "Offline speech recognition (lightweight, CPU-friendly)",
	order: 1,
	capabilities: {
		requiresApiKey: false,
		requiresModel: true,
		runtime: "rust",
	},
	configFields: [],
	supportedLanguages: [
		"ko-KR", "en-US", "ja-JP", "zh-CN", "fr-FR", "de-DE",
		"ru-RU", "es-ES", "pt-BR", "hi-IN", "ar-SA", "vi-VN",
		"id-ID", "bn-IN",
	],
});
