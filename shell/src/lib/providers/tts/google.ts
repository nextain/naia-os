import { defineProvider } from "../registry";

export const googleTtsProvider = defineProvider({
	id: "google",
	type: "tts",
	name: "Google Cloud TTS",
	description: "Google Cloud Text-to-Speech API",
	order: 3,
	capabilities: {
		requiresApiKey: true,
		runtime: "node",
	},
	configFields: [
		{
			key: "googleApiKey",
			label: "Google API Key",
			type: "password",
			required: true,
			placeholder: "AIza...",
			description: "Gemini API key also works for Google Cloud TTS",
		},
	],
	defaultVoice: "ko-KR-Neural2-A",
	listVoices: () => [
		// Google Cloud TTS voices are fetched dynamically via API
		// These are commonly used defaults
		{ id: "ko-KR-Neural2-A", label: "Korean Female A", locale: "ko-KR", gender: "female" },
		{ id: "ko-KR-Neural2-B", label: "Korean Female B", locale: "ko-KR", gender: "female" },
		{ id: "ko-KR-Neural2-C", label: "Korean Male C", locale: "ko-KR", gender: "male" },
		{ id: "en-US-Neural2-A", label: "English Female A", locale: "en-US", gender: "female" },
		{ id: "en-US-Neural2-D", label: "English Male D", locale: "en-US", gender: "male" },
		{ id: "ja-JP-Neural2-B", label: "Japanese Female B", locale: "ja-JP", gender: "female" },
		{ id: "ja-JP-Neural2-C", label: "Japanese Male C", locale: "ja-JP", gender: "male" },
	],
});
