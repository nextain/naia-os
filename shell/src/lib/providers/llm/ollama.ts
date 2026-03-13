import { defineProvider } from "../registry";

export const ollamaProvider = defineProvider({
	id: "ollama",
	type: "llm",
	name: "Ollama",
	description: "Local LLM via Ollama",
	order: 8,
	capabilities: {
		requiresApiKey: false,
	},
	configFields: [
		{
			key: "ollamaHost",
			label: "Ollama Host",
			type: "text",
			placeholder: "http://localhost:11434",
			description: "Ollama server URL",
		},
	],
	defaultModel: "",
	envVar: undefined,
	listModels: () => [],
});
