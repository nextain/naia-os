import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";
import type { LLMProvider, ProviderConfig } from "./types.js";
import { createXAIProvider } from "./xai.js";

export function buildProvider(config: ProviderConfig): LLMProvider {
	switch (config.provider) {
		case "gemini":
			return createGeminiProvider(config.apiKey, config.model);
		case "xai":
			return createXAIProvider(config.apiKey, config.model);
		case "anthropic":
			return createAnthropicProvider(config.apiKey, config.model);
		default:
			throw new Error(`Unknown provider: ${config.provider}`);
	}
}
