import { GoogleGenAI } from "@google/genai";
import type { AgentStream, LLMProvider } from "./types.js";

export function createGeminiProvider(
	apiKey: string,
	model: string,
): LLMProvider {
	const client = new GoogleGenAI({ apiKey });

	return {
		async *stream(messages, systemPrompt): AgentStream {
			const contents = messages.map((m) => ({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: m.content }],
			}));

			const response = await client.models.generateContentStream({
				model,
				contents,
				config: {
					systemInstruction: systemPrompt,
					temperature: 0.7,
				},
			});

			let inputTokens = 0;
			let outputTokens = 0;

			for await (const chunk of response) {
				const text = chunk.text;
				if (text) {
					yield { type: "text", text };
				}
				if (chunk.usageMetadata) {
					inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
					outputTokens =
						chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
				}
			}

			if (inputTokens > 0 || outputTokens > 0) {
				yield { type: "usage", inputTokens, outputTokens };
			}
			yield { type: "finish" };
		},
	};
}
