import { createOpenAICompatProvider } from "./openai-compat.js";
import type { LLMProvider } from "./types.js";

export function createXAIProvider(apiKey: string, model: string): LLMProvider {
	return createOpenAICompatProvider({
		apiKey,
		model,
		baseUrl: "https://api.x.ai/v1",
	});
}
