import { createOpenAICompatProvider } from "./openai-compat.js";
import type { LLMProvider } from "./types.js";

export function createZAIProvider(apiKey: string, model: string): LLMProvider {
	return createOpenAICompatProvider({
		apiKey,
		model,
		baseUrl: "https://open.bigmodel.cn/api/paas/v4",
	});
}
