import { createOpenAICompatProvider } from "./openai-compat.js";
import type { LLMProvider } from "./types.js";

export function createOpenAIProvider(
	apiKey: string,
	model: string,
	ollamaHost?: string,
): LLMProvider {
	const isOllama = apiKey === "ollama";
	return createOpenAICompatProvider({
		apiKey: isOllama ? "ollama" : apiKey,
		model,
		baseUrl: isOllama
			? `${(ollamaHost || "http://localhost:11434").replace(/\/+$/, "")}/v1`
			: undefined,
	});
}
