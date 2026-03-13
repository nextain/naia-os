import { defineProvider } from "../registry";

export const zaiProvider = defineProvider({
	id: "zai",
	type: "llm",
	name: "Zhipu AI (GLM)",
	order: 7,
	capabilities: {
		requiresApiKey: true,
	},
	configFields: [
		{
			key: "apiKey",
			label: "Zhipu API Key",
			type: "password",
			required: true,
		},
	],
	defaultModel: "glm-4.7",
	envVar: "ZHIPU_API_KEY",
	listModels: () => [
		{ id: "glm-4.7", label: "GLM 4.7 ($0.60 / $2.20)", type: "llm" },
	],
});
