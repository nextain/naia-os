import { defineProvider } from "../registry";

export const anthropicProvider = defineProvider({
	id: "anthropic",
	type: "llm",
	name: "Anthropic (Claude)",
	order: 5,
	capabilities: {
		requiresApiKey: true,
	},
	configFields: [
		{
			key: "apiKey",
			label: "Anthropic API Key",
			type: "password",
			required: true,
			placeholder: "sk-ant-...",
		},
	],
	defaultModel: "claude-sonnet-4-6",
	envVar: "ANTHROPIC_API_KEY",
	listModels: () => [
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6 ($15.00 / $75.00)", type: "llm" },
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 ($3.00 / $15.00)", type: "llm" },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 ($0.80 / $4.00)", type: "llm" },
	],
});
