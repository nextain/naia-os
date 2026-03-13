import { defineProvider } from "../registry";

export const xaiProvider = defineProvider({
	id: "xai",
	type: "llm",
	name: "xAI (Grok)",
	order: 6,
	capabilities: {
		requiresApiKey: true,
	},
	configFields: [
		{
			key: "apiKey",
			label: "xAI API Key",
			type: "password",
			required: true,
			placeholder: "xai-...",
		},
	],
	defaultModel: "grok-3-mini",
	envVar: "XAI_API_KEY",
	listModels: () => [
		{ id: "grok-3-mini", label: "Grok 3 Mini ($0.30 / $0.50)", type: "llm" },
	],
});
