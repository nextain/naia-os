import { defineProvider } from "../registry";

export const geminiProvider = defineProvider({
	id: "gemini",
	type: "llm",
	name: "Google Gemini",
	order: 3,
	capabilities: {
		requiresApiKey: true,
	},
	configFields: [
		{
			key: "apiKey",
			label: "Gemini API Key",
			type: "password",
			required: true,
			placeholder: "AIza...",
		},
	],
	defaultModel: "gemini-3-flash-preview",
	envVar: "GEMINI_API_KEY",
	listModels: () => [
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro ($2.00 / $12.00)", type: "llm" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash ($0.50 / $3.00)", type: "llm" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro ($1.25 / $10.00)", type: "llm" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash ($0.30 / $2.50)", type: "llm" },
	],
});
