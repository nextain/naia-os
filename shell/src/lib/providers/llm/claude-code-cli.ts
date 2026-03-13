import { defineProvider } from "../registry";

export const claudeCodeCliProvider = defineProvider({
	id: "claude-code-cli",
	type: "llm",
	name: "Claude Code CLI (Local)",
	description: "Uses local Claude Code CLI installation",
	order: 2,
	capabilities: {
		requiresApiKey: false,
	},
	configFields: [],
	defaultModel: "claude-sonnet-4-6",
	envVar: undefined,
	listModels: () => [
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6", type: "llm" },
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", type: "llm" },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", type: "llm" },
	],
});
