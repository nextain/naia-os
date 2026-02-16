export type ProviderId = "gemini" | "xai" | "anthropic";

export interface ProviderConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
}

/** Chunk types emitted by a provider stream */
export type StreamChunk =
	| { type: "text"; text: string }
	| {
			type: "usage";
			inputTokens: number;
			outputTokens: number;
	  }
	| { type: "finish" };

/** Async generator that yields streaming chunks */
export type AgentStream = AsyncGenerator<StreamChunk, void, undefined>;

/** Provider interface — each LLM provider implements this */
export interface LLMProvider {
	stream(
		messages: { role: "user" | "assistant"; content: string }[],
		systemPrompt: string,
	): AgentStream;
}
