/**
 * Agent-side provider runtime registry.
 *
 * Separates runtime implementations (LLM factories, TTS synthesizers)
 * from the shell-side metadata registry. Both use the same string IDs.
 *
 * Usage:
 *   import { registerLlm, getLlm } from "./registry.js";
 *   registerLlm("openai", (config) => createOpenAIProvider(config));
 *   const provider = getLlm("openai")(config);
 */

import type { LLMProvider, ProviderConfig } from "./types.js";

// ── LLM Registry ──

export type LlmFactory = (config: ProviderConfig) => LLMProvider;

const llmRegistry = new Map<string, LlmFactory>();

/** Register an LLM provider factory. */
export function registerLlm(id: string, factory: LlmFactory): void {
	llmRegistry.set(id, factory);
}

/** Get an LLM provider factory by ID. Throws if not found. */
export function getLlm(id: string): LlmFactory {
	const factory = llmRegistry.get(id);
	if (!factory) {
		throw new Error(`Unknown LLM provider: ${id}`);
	}
	return factory;
}

/** Check if an LLM provider is registered. */
export function hasLlm(id: string): boolean {
	return llmRegistry.has(id);
}

// ── TTS Registry ──

export interface TtsSynthesizeOptions {
	text: string;
	voice?: string;
	apiKey?: string;
	naiaKey?: string;
}

/** Returns base64-encoded audio string, or null on failure. */
export type TtsSynthesizer = (
	options: TtsSynthesizeOptions,
) => Promise<string | null>;

const ttsRegistry = new Map<string, TtsSynthesizer>();

/** Register a TTS synthesizer function. */
export function registerTts(id: string, synthesizer: TtsSynthesizer): void {
	ttsRegistry.set(id, synthesizer);
}

/** Get a TTS synthesizer by ID. Returns undefined if not found. */
export function getTts(id: string): TtsSynthesizer | undefined {
	return ttsRegistry.get(id);
}

/** Check if a TTS provider is registered. */
export function hasTts(id: string): boolean {
	return ttsRegistry.has(id);
}

/** Get all registered TTS provider IDs. */
export function listTtsIds(): string[] {
	return Array.from(ttsRegistry.keys());
}
