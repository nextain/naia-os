/**
 * LLM provider auto-registration for the agent runtime.
 * Import this file to populate the LLM registry with all providers.
 */

import { registerLlm } from "./registry.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createClaudeCodeCliProvider } from "./claude-code-cli.js";
import { createGeminiProvider } from "./gemini.js";
import { createLabProxyProvider } from "./lab-proxy.js";
import { createOpenAIProvider } from "./openai.js";
import { createOpenAICompatProvider } from "./openai-compat.js";

const getApiKey = (key: string, envVar: string) =>
	key || process.env[envVar] || "";

// ── Core providers (native SDK) ──

registerLlm("nextain", (config) => {
	if (!config.naiaKey) {
		throw new Error("Naia provider requires Naia account login.");
	}
	return createLabProxyProvider(config.naiaKey, config.model);
});

registerLlm("claude-code-cli", (config) => {
	return createClaudeCodeCliProvider(config.model);
});

registerLlm("gemini", (config) => {
	return createGeminiProvider(
		getApiKey(config.apiKey, "GEMINI_API_KEY"),
		config.model,
	);
});

registerLlm("openai", (config) => {
	return createOpenAIProvider(
		getApiKey(config.apiKey, "OPENAI_API_KEY"),
		config.model,
	);
});

registerLlm("anthropic", (config) => {
	return createAnthropicProvider(
		getApiKey(config.apiKey, "ANTHROPIC_API_KEY"),
		config.model,
	);
});

// ── OpenAI-compatible providers ──

registerLlm("xai", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "XAI_API_KEY"),
		model: config.model,
		baseUrl: "https://api.x.ai/v1",
	});
});

registerLlm("zai", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "ZHIPU_API_KEY"),
		model: config.model,
		baseUrl: "https://open.bigmodel.cn/api/paas/v4",
	});
});

registerLlm("deepseek", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "DEEPSEEK_API_KEY"),
		model: config.model,
		baseUrl: "https://api.deepseek.com/",
	});
});

registerLlm("groq", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "GROQ_API_KEY"),
		model: config.model,
		baseUrl: "https://api.groq.com/openai/v1/",
	});
});

registerLlm("mistral", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "MISTRAL_API_KEY"),
		model: config.model,
		baseUrl: "https://api.mistral.ai/v1/",
	});
});

registerLlm("openrouter", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "OPENROUTER_API_KEY"),
		model: config.model,
		baseUrl: "https://openrouter.ai/api/v1/",
	});
});

registerLlm("perplexity", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "PERPLEXITY_API_KEY"),
		model: config.model,
		baseUrl: "https://api.perplexity.ai/",
	});
});

registerLlm("together", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "TOGETHER_API_KEY"),
		model: config.model,
		baseUrl: "https://api.together.xyz/v1/",
	});
});

registerLlm("fireworks", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "FIREWORKS_API_KEY"),
		model: config.model,
		baseUrl: "https://api.fireworks.ai/inference/v1/",
	});
});

registerLlm("cerebras", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "CEREBRAS_API_KEY"),
		model: config.model,
		baseUrl: "https://api.cerebras.ai/v1/",
	});
});

registerLlm("nvidia", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "NVIDIA_API_KEY"),
		model: config.model,
		baseUrl: "https://integrate.api.nvidia.com/v1/",
	});
});

registerLlm("cohere", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "COHERE_API_KEY"),
		model: config.model,
		baseUrl: "https://api.cohere.com/compatibility/v1/",
	});
});

registerLlm("sambanova", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "SAMBANOVA_API_KEY"),
		model: config.model,
		baseUrl: "https://api.sambanova.ai/v1/",
	});
});

registerLlm("novita", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "NOVITA_API_KEY"),
		model: config.model,
		baseUrl: "https://api.novita.ai/v3/openai/",
	});
});

registerLlm("hyperbolic", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "HYPERBOLIC_API_KEY"),
		model: config.model,
		baseUrl: "https://api.hyperbolic.xyz/v1/",
	});
});

registerLlm("github-models", (config) => {
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "GITHUB_TOKEN"),
		model: config.model,
		baseUrl: "https://models.inference.ai.azure.com/",
	});
});

registerLlm("cloudflare", (config) => {
	const accountId = config.extra?.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || "";
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "CLOUDFLARE_API_TOKEN"),
		model: config.model,
		baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/`,
	});
});

registerLlm("azure", (config) => {
	const endpoint = (config.extra?.azureEndpoint || process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
	return createOpenAICompatProvider({
		apiKey: getApiKey(config.apiKey, "AZURE_API_KEY"),
		model: config.model,
		baseUrl: `${endpoint}/openai/deployments/${config.model}/`,
	});
});

// ── Local / self-hosted ──

registerLlm("ollama", (config) => {
	return createOpenAIProvider("ollama", config.model, config.ollamaHost);
});

registerLlm("lm-studio", (config) => {
	const host = (config.extra?.lmStudioHost || "http://localhost:1234").replace(/\/+$/, "");
	return createOpenAICompatProvider({
		apiKey: config.apiKey || "lm-studio",
		model: config.model,
		baseUrl: `${host}/v1`,
	});
});

// ── Generic fallback ──

registerLlm("openai-compatible", (config) => {
	const baseUrl = config.extra?.openaiCompatBaseUrl;
	if (!baseUrl) {
		throw new Error("OpenAI Compatible provider requires a Base URL.");
	}
	return createOpenAICompatProvider({
		apiKey: config.apiKey || "no-key",
		model: config.model,
		baseUrl,
	});
});
