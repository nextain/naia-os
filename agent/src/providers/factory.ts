import type { LLMProvider, ProviderConfig } from "./types.js";
import { getLlm } from "./registry.js";
import "./register.js";

export function buildProvider(config: ProviderConfig): LLMProvider {
	// Lab proxy mode: route through any-llm Gateway (naiaKey overrides provider selection)
	if (config.naiaKey) {
		return getLlm("nextain")(config);
	}

	return getLlm(config.provider)(config);
}
