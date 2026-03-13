import { defineProvider } from "../registry";

export const openaiProvider = defineProvider({
	id: "openai",
	type: "llm",
	name: "OpenAI (ChatGPT)",
	order: 4,
	disabled: true,
	capabilities: {
		requiresApiKey: true,
	},
	configFields: [
		{
			key: "apiKey",
			label: "OpenAI API Key",
			type: "password",
			required: true,
			placeholder: "sk-...",
		},
	],
	defaultModel: "gpt-4o",
	envVar: "OPENAI_API_KEY",
	listModels: () => [
		{ id: "gpt-4o", label: "GPT-4o ($2.50 / $10.00)", type: "llm" },
	],
});
