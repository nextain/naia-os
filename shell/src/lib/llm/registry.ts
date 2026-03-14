import type { LlmModelMeta, LlmProviderMeta, LlmVoiceMeta } from "./types";

const providers = new Map<string, LlmProviderMeta>();

/** Register an LLM provider. */
export function registerLlmProvider(meta: LlmProviderMeta): void {
	providers.set(meta.id, meta);
}

/** Get a registered LLM provider by id. */
export function getLlmProvider(id: string): LlmProviderMeta | undefined {
	return providers.get(id);
}

/** List all registered LLM providers (in registration order). */
export function listLlmProviders(): LlmProviderMeta[] {
	return Array.from(providers.values());
}

/** Get model metadata. */
export function getLlmModel(providerId: string, modelId: string): LlmModelMeta | undefined {
	return providers.get(providerId)?.models.find((m) => m.id === modelId);
}

/** Check if a model is omni (built-in voice). */
export function isOmniModel(providerId: string, modelId: string): boolean {
	return getLlmModel(providerId, modelId)?.type === "omni";
}

/** Get default model for a provider. */
export function getDefaultLlmModel(providerId: string): string {
	return providers.get(providerId)?.defaultModel ?? "";
}

/** Check if a provider does not require any API key (neither provider key nor Naia key). */
export function isApiKeyOptional(providerId: string): boolean {
	const p = providers.get(providerId);
	if (!p) return false;
	return !p.requiresApiKey && !p.requiresNaiaKey;
}

/** Build initial models record from all registered providers. */
export function getStaticModelsRecord(): Record<string, LlmModelMeta[]> {
	const record: Record<string, LlmModelMeta[]> = {};
	for (const p of providers.values()) {
		record[p.id] = [...p.models];
	}
	return record;
}

/** Fetch Ollama models with connection status. */
export async function fetchOllamaModels(host: string): Promise<{ models: LlmModelMeta[]; connected: boolean }> {
	const provider = providers.get("ollama");
	if (!provider?.fetchModels) return { models: [], connected: false };
	const models = await provider.fetchModels(host);
	return { models: models ?? [], connected: models !== null };
}

/** Format model label with pricing (e.g. "Gemini 3 Pro ($2.00 / $12.00)"). */
export function formatModelLabel(model: LlmModelMeta): string {
	if (!model.pricing) return model.label;
	const [input, output] = model.pricing;
	return `${model.label} ($${input.toFixed(2)} / $${output.toFixed(2)})`;
}

// ── Shared voice lists ──

export const GEMINI_LIVE_VOICES: LlmVoiceMeta[] = [
	{ id: "Kore", label: "Kore (여성, 차분)" },
	{ id: "Puck", label: "Puck (남성, 활발)" },
	{ id: "Charon", label: "Charon (남성)" },
	{ id: "Aoede", label: "Aoede (여성)" },
	{ id: "Fenrir", label: "Fenrir (남성)" },
	{ id: "Leda", label: "Leda (여성)" },
	{ id: "Orus", label: "Orus (남성)" },
	{ id: "Zephyr", label: "Zephyr (중성)" },
];

export const OPENAI_REALTIME_VOICES: LlmVoiceMeta[] = [
	{ id: "alloy", label: "Alloy (중성)" },
	{ id: "ash", label: "Ash (남성)" },
	{ id: "ballad", label: "Ballad (남성)" },
	{ id: "coral", label: "Coral (여성)" },
	{ id: "echo", label: "Echo (남성)" },
	{ id: "sage", label: "Sage (여성)" },
	{ id: "shimmer", label: "Shimmer (여성)" },
	{ id: "verse", label: "Verse (남성)" },
	{ id: "marin", label: "Marin (추천)" },
	{ id: "cedar", label: "Cedar (추천)" },
];

// ── Provider registrations ──

registerLlmProvider({
	id: "nextain",
	name: "Naia",
	description: "Naia Cloud — no API key needed.",
	descKey: "onboard.lab.description",
	requiresApiKey: false,
	requiresNaiaKey: true,
	defaultModel: "gemini-3-flash-preview",
	models: [
		{ id: "gemini-3-pro-preview", label: "Gemini 3 Pro", type: "llm" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash", type: "llm" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", type: "llm" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", type: "llm" },
		{
			id: "gemini-2.5-flash-live",
			label: "Gemini 2.5 Flash Live 🗣️",
			type: "omni",
			voiceSelectable: true,
			voices: [...GEMINI_LIVE_VOICES],
			transcriptProvided: true,
		},
	],
});

registerLlmProvider({
	id: "claude-code-cli",
	name: "Claude Code",
	description: "Claude Code CLI — uses local Claude installation.",
	descKey: "provider.claudeCodeCli.desc",
	requiresApiKey: false,
	defaultModel: "claude-sonnet-4-6",
	models: [
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6", type: "llm" },
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", type: "llm" },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", type: "llm" },
	],
});

registerLlmProvider({
	id: "gemini",
	name: "Google Gemini",
	description: "Google Gemini API — requires Google API key.",
	descKey: "provider.apiKeyRequired",
	requiresApiKey: true,
	defaultModel: "gemini-3-flash-preview",
	models: [
		{ id: "gemini-3-pro-preview", label: "Gemini 3 Pro", type: "llm", pricing: [2.00, 12.00] },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash", type: "llm", pricing: [0.50, 3.00] },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", type: "llm", pricing: [1.25, 10.00] },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", type: "llm", pricing: [0.30, 2.50] },
		{
			id: "gemini-2.5-flash-live",
			label: "Gemini 2.5 Flash Live 🗣️ (~$0.03/min)",
			type: "omni",
			voiceSelectable: true,
			voices: [...GEMINI_LIVE_VOICES],
			transcriptProvided: true,
		},
	],
});

registerLlmProvider({
	id: "openai",
	name: "OpenAI",
	description: "OpenAI GPT models — requires OpenAI API key.",
	descKey: "provider.apiKeyRequired",
	requiresApiKey: true,
	defaultModel: "gpt-4o",
	models: [
		{ id: "gpt-4o", label: "GPT-4o", type: "llm", pricing: [2.50, 10.00] },
		{
			id: "gpt-4o-realtime",
			label: "GPT-4o Realtime 🗣️ (~$0.10/min)",
			type: "omni",
			voiceSelectable: true,
			voices: [...OPENAI_REALTIME_VOICES],
			transcriptProvided: true,
		},
	],
});

registerLlmProvider({
	id: "anthropic",
	name: "Anthropic",
	description: "Claude models — requires Anthropic API key.",
	descKey: "provider.apiKeyRequired",
	requiresApiKey: true,
	defaultModel: "claude-sonnet-4-6",
	models: [
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6", type: "llm", pricing: [15.00, 75.00] },
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", type: "llm", pricing: [3.00, 15.00] },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", type: "llm", pricing: [0.80, 4.00] },
	],
});

registerLlmProvider({
	id: "xai",
	name: "xAI",
	description: "Grok models — requires xAI API key.",
	descKey: "provider.apiKeyRequired",
	requiresApiKey: true,
	defaultModel: "grok-3-mini",
	models: [
		{ id: "grok-3-mini", label: "Grok 3 Mini", type: "llm", pricing: [0.30, 0.50] },
	],
});

registerLlmProvider({
	id: "zai",
	name: "Zhipu AI",
	description: "GLM models — requires Zhipu API key.",
	descKey: "provider.apiKeyRequired",
	requiresApiKey: true,
	defaultModel: "glm-4.7",
	models: [
		{ id: "glm-4.7", label: "GLM 4.7", type: "llm", pricing: [0.60, 2.20] },
	],
});

registerLlmProvider({
	id: "ollama",
	name: "Ollama",
	description: "Local Ollama models — no API key, runs on your machine.",
	descKey: "provider.localRequired",
	requiresApiKey: false,
	isLocal: true,
	defaultModel: "",
	models: [],
	async fetchModels(host) {
		try {
			const resp = await fetch(`${host}/api/tags`);
			if (!resp.ok) return null;
			const data = await resp.json();
			return (data.models ?? []).map((m: { name: string; size?: number; details?: { quantization_level?: string; parameter_size?: string } }) => {
				const sizeGB = m.size ? `${(m.size / 1e9).toFixed(1)}GB` : "";
				const quant = m.details?.quantization_level ?? "";
				const params = m.details?.parameter_size ?? "";
				const extra = [params, sizeGB, quant].filter(Boolean).join(", ");
				return {
					id: m.name,
					label: extra ? `${m.name} (${extra})` : m.name,
					type: "llm" as const,
				};
			});
		} catch {
			return null;
		}
	},
});
