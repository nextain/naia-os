import { defineProvider } from "../registry";

export const webSpeechApiProvider = defineProvider({
	id: "web-speech-api",
	type: "stt",
	name: "Web Speech API",
	description: "Browser built-in speech recognition (Chrome/Edge)",
	order: 3,
	capabilities: {
		requiresApiKey: false,
		requiresModel: false,
		browserOnly: true,
		runtime: "browser",
	},
	configFields: [],
	supportedLanguages: [
		"ko-KR", "en-US", "ja-JP", "zh-CN", "fr-FR", "de-DE",
		"es-ES", "pt-BR", "it-IT", "nl-NL",
	],
});
