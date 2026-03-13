import { Logger } from "./logger";
import { getProvider } from "./providers/registry";
import type { ProviderId } from "./types";

/** Minimal message shape for summarization/fact extraction */
interface MessageRow {
	role: string;
	content: string;
}

/** Summarize a list of messages into 2-3 sentences using LLM API */
export async function summarizeSession(
	messages: MessageRow[],
	apiKey: string,
	provider: ProviderId,
	model?: string,
): Promise<string> {
	if (messages.length === 0) return "";

	const conversationText = messages
		.map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
		.join("\n");

	const prompt = `Summarize this conversation in 2-3 sentences in the same language as the conversation. Focus on key topics discussed and any decisions made.\n\n${conversationText}`;

	try {
		return await callLlmApi(prompt, apiKey, provider, model);
	} catch (err) {
		Logger.warn("memory-processor", "Summarization failed", {
			error: String(err),
		});
		return "";
	}
}

/** Extract key facts from messages + summary using LLM API */
export async function extractFacts(
	messages: MessageRow[],
	summary: string,
	apiKey: string,
	provider: ProviderId,
	model?: string,
): Promise<Array<{ key: string; value: string }>> {
	if (messages.length === 0) return [];

	const conversationText = messages
		.map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
		.join("\n")
		.slice(0, 3000);

	const prompt = `Extract key facts about the user from this conversation. Return ONLY a JSON array of {"key": "...", "value": "..."} objects. Focus on: user preferences, personal info they shared, important decisions. If no facts, return [].

Summary: ${summary}

Conversation:
${conversationText}`;

	try {
		const response = await callLlmApi(prompt, apiKey, provider, model);
		const jsonMatch = response.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];
		return JSON.parse(jsonMatch[0]);
	} catch (err) {
		Logger.warn("memory-processor", "Fact extraction failed", {
			error: String(err),
		});
		return [];
	}
}

/** Default models per provider for memory processing tasks */
const DEFAULT_MEMORY_MODELS: Record<string, string> = {
	gemini: "gemini-2.5-flash",
	xai: "grok-3-mini",
	anthropic: "claude-sonnet-4-5-20250929",
	openai: "gpt-4o-mini",
	deepseek: "deepseek-chat",
	groq: "llama-3.3-70b-versatile",
	mistral: "mistral-small-latest",
};

/** Base URLs for OpenAI-compatible providers (used by memory processor). */
const OPENAI_COMPAT_URLS: Record<string, string> = {
	xai: "https://api.x.ai/v1/chat/completions",
	zai: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
	openai: "https://api.openai.com/v1/chat/completions",
	deepseek: "https://api.deepseek.com/chat/completions",
	groq: "https://api.groq.com/openai/v1/chat/completions",
	mistral: "https://api.mistral.ai/v1/chat/completions",
	openrouter: "https://openrouter.ai/api/v1/chat/completions",
	perplexity: "https://api.perplexity.ai/chat/completions",
	together: "https://api.together.xyz/v1/chat/completions",
	fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
	cerebras: "https://api.cerebras.ai/v1/chat/completions",
	nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
	cohere: "https://api.cohere.com/compatibility/v1/chat/completions",
	sambanova: "https://api.sambanova.ai/v1/chat/completions",
	novita: "https://api.novita.ai/v3/openai/chat/completions",
	hyperbolic: "https://api.hyperbolic.xyz/v1/chat/completions",
	"github-models": "https://models.inference.ai.azure.com/chat/completions",
};

/** Gemini 3 series requires temperature 1.0 (lower values cause looping) */
function geminiTemperature(model: string): number {
	return model.startsWith("gemini-3") ? 1.0 : 0.3;
}

/** Generic LLM API call — supports gemini, anthropic native APIs, plus all OpenAI-compatible providers. */
async function callLlmApi(
	prompt: string,
	apiKey: string,
	provider: ProviderId,
	model?: string,
): Promise<string> {
	const defaultModel = model || DEFAULT_MEMORY_MODELS[provider] || getProvider(provider, "llm")?.defaultModel || "gpt-4o-mini";
	switch (provider) {
		case "gemini":
		case "nextain":
			return callGemini(prompt, apiKey, defaultModel);
		case "anthropic":
			return callAnthropic(prompt, apiKey, defaultModel);
		default: {
			const baseUrl = OPENAI_COMPAT_URLS[provider];
			if (baseUrl) {
				return callOpenAICompat(prompt, apiKey, baseUrl, defaultModel);
			}
			Logger.warn("memory-processor", `No API URL for provider "${provider}", skipping memory processing`);
			return "";
		}
	}
}

async function callGemini(
	prompt: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: {
				maxOutputTokens: 256,
				temperature: geminiTemperature(model),
			},
		}),
	});
	if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
	const data = await res.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAICompat(
	prompt: string,
	apiKey: string,
	baseUrl: string,
	model: string,
): Promise<string> {
	const res = await fetch(baseUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
			max_tokens: 256,
			temperature: 0.3,
		}),
	});
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(
	prompt: string,
	apiKey: string,
	model: string,
): Promise<string> {
	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			max_tokens: 256,
			messages: [{ role: "user", content: prompt }],
		}),
	});
	if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
	const data = await res.json();
	return data.content?.[0]?.text || "";
}
