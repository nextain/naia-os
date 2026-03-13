import { defineProvider } from "../registry";

export const nextainProvider = defineProvider({
	id: "nextain",
	type: "llm",
	name: "Naia",
	description: "Naia Lab cloud AI (requires Naia account)",
	order: 1,
	capabilities: {
		requiresApiKey: false,
	},
	configFields: [],
	defaultModel: "gemini-3-flash-preview",
	envVar: undefined,
	listModels: () => [
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", type: "llm" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash", type: "llm" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", type: "llm" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", type: "llm" },
	],
});
