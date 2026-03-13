import { defineProvider } from "../registry";

export const openaiTtsProvider = defineProvider({
	id: "openai",
	type: "tts",
	name: "OpenAI TTS",
	description: "OpenAI Text-to-Speech API",
	order: 4,
	capabilities: {
		requiresApiKey: true,
		runtime: "node",
	},
	configFields: [
		{
			key: "openaiTtsApiKey",
			label: "OpenAI API Key",
			type: "password",
			required: true,
			placeholder: "sk-...",
		},
	],
	defaultVoice: "alloy",
	listVoices: () => [
		{ id: "alloy", label: "Alloy (Neutral)", gender: "neutral" },
		{ id: "echo", label: "Echo (Male)", gender: "male" },
		{ id: "fable", label: "Fable (Male)", gender: "male" },
		{ id: "onyx", label: "Onyx (Male)", gender: "male" },
		{ id: "nova", label: "Nova (Female)", gender: "female" },
		{ id: "shimmer", label: "Shimmer (Female)", gender: "female" },
	],
});
