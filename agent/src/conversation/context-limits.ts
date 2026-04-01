// ── Model Context Window Limits ──────────────────────────────────────────────
// Maps model IDs to their maximum context window sizes (in tokens).
// Used by token budget checks to prevent context overflow.

/** Context window size in tokens for known models. */
export const MODEL_CONTEXT_WINDOWS: ReadonlyMap<string, number> = new Map([
	// Anthropic
	["claude-sonnet-4-5-20250929", 200_000],
	["claude-haiku-4-5-20251001", 200_000],
	["claude-opus-4-5-20251101", 200_000],
	["claude-sonnet-4-20250514", 200_000],

	// Google
	["gemini-2.5-flash", 1_000_000],
	["gemini-2.5-pro", 1_000_000],
	["gemini-3-pro-preview", 1_000_000],

	// OpenAI
	["gpt-4o", 128_000],
	["gpt-4o-mini", 128_000],
	["gpt-5.2", 256_000],
	["o4-mini", 200_000],

	// xAI
	["grok-4", 131_072],
	["grok-3-mini", 131_072],

	// Local (vllm)
	["qwen3-8b", 32_768],
	["minicpm-o-2_6", 8_192],
]);

/** Default context window when model is unknown. Conservative. */
const DEFAULT_CONTEXT_WINDOW = 32_768;

/** Get the context window size for a model. Falls back to conservative default. */
export function getContextWindow(model: string): number {
	// Try exact match first
	const exact = MODEL_CONTEXT_WINDOWS.get(model);
	if (exact) return exact;

	// Try prefix match (e.g., "claude-sonnet-4-5" matches "claude-sonnet-4-5-20250929")
	for (const [key, value] of MODEL_CONTEXT_WINDOWS) {
		if (model.startsWith(key) || key.startsWith(model)) {
			return value;
		}
	}

	return DEFAULT_CONTEXT_WINDOW;
}
