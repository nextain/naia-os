/**
 * Shared OpenAI-compatible message/tool conversion utilities and provider factory.
 * Used by xai.ts, openai.ts, zai.ts, lab-proxy.ts, and all OpenAI-compatible providers.
 */
import OpenAI from "openai";
import type { AgentStream, ChatMessage, LLMProvider, ToolDefinition } from "./types.js";

/** OpenAI chat completion message (minimal type for cross-provider use) */
export interface OpenAICompatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
	tool_call_id?: string;
}

/** OpenAI chat completion tool definition */
export interface OpenAICompatTool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

/** Convert ChatMessage[] to OpenAI-compatible message format */
export function toOpenAIMessages(
	messages: ChatMessage[],
	systemPrompt: string,
): OpenAICompatMessage[] {
	const result: OpenAICompatMessage[] = [
		{ role: "system", content: systemPrompt },
	];
	for (const m of messages) {
		if (m.toolCalls && m.toolCalls.length > 0) {
			result.push({
				role: "assistant",
				content: m.content || null,
				tool_calls: m.toolCalls.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: {
						name: tc.name,
						arguments: JSON.stringify(tc.args),
					},
				})),
			});
		} else if (m.role === "tool") {
			result.push({
				role: "tool",
				tool_call_id: m.toolCallId!,
				content: m.content,
			});
		} else {
			result.push({
				role: m.role as "user" | "assistant",
				content: m.content,
			});
		}
	}
	return result;
}

/** Convert ToolDefinition[] to OpenAI-compatible tool format */
export function toOpenAITools(tools: ToolDefinition[]): OpenAICompatTool[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters as Record<string, unknown>,
		},
	}));
}

// ── OpenAI-Compatible Provider Factory ──

export interface OpenAICompatProviderOptions {
	apiKey: string;
	model: string;
	baseUrl?: string;
	temperature?: number;
}

/**
 * Create an LLMProvider for any OpenAI-compatible API.
 * Handles streaming, tool call accumulation, and usage tracking.
 *
 * Used directly by: openai, xai, zai, ollama, and all third-party
 * providers that expose an OpenAI-compatible chat completions endpoint.
 */
export function createOpenAICompatProvider(
	options: OpenAICompatProviderOptions,
): LLMProvider {
	const client = new OpenAI({
		apiKey: options.apiKey,
		baseURL: options.baseUrl,
	});

	return {
		async *stream(messages, systemPrompt, tools, signal): AgentStream {
			const body: OpenAI.ChatCompletionCreateParamsStreaming = {
				model: options.model,
				temperature: options.temperature ?? 0.7,
				messages: toOpenAIMessages(
					messages,
					systemPrompt,
				) as OpenAI.ChatCompletionMessageParam[],
				stream: true,
				stream_options: { include_usage: true },
			};
			if (tools && tools.length > 0) {
				body.tools = toOpenAITools(tools) as OpenAI.ChatCompletionTool[];
			}

			const stream = await client.chat.completions.create(body, {
				signal: signal ?? undefined,
			});

			let inputTokens = 0;
			let outputTokens = 0;

			// Accumulate tool call arguments across multiple delta chunks
			const pendingToolCalls = new Map<
				number,
				{ id: string; name: string; args: string }
			>();

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta;
				if (delta?.content) {
					yield { type: "text", text: delta.content };
				}

				// Tool calls — accumulate arguments across chunks
				const toolCalls = delta?.tool_calls;
				if (toolCalls) {
					for (const tc of toolCalls) {
						const existing = pendingToolCalls.get(tc.index);
						if (tc.id && tc.function?.name) {
							pendingToolCalls.set(tc.index, {
								id: tc.id,
								name: tc.function.name,
								args: tc.function.arguments ?? "",
							});
						} else if (existing && tc.function?.arguments) {
							existing.args += tc.function.arguments;
						}
					}
				}

				if (chunk.usage) {
					inputTokens = chunk.usage.prompt_tokens ?? 0;
					outputTokens = chunk.usage.completion_tokens ?? 0;
				}
			}

			// Emit accumulated tool calls
			for (const tc of pendingToolCalls.values()) {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(tc.args || "{}");
				} catch {
					// malformed JSON — emit empty args
				}
				yield { type: "tool_use", id: tc.id, name: tc.name, args };
			}

			if (inputTokens > 0 || outputTokens > 0) {
				yield { type: "usage", inputTokens, outputTokens };
			}
			yield { type: "finish" };
		},
	};
}
