// ── Token Budget Management ──────────────────────────────────────────────────
// Pre-flight check before LLM calls to prevent context overflow.
// Phase 1: Warning + error thresholds. Phase 2 will add compaction.

import { getContextWindow } from "./context-limits.js";

/** Budget check result. */
export type BudgetStatus = "ok" | "warning" | "critical";

/** Result of a token budget check. */
export interface BudgetCheckResult {
	status: BudgetStatus;
	estimatedTokens: number;
	contextWindow: number;
	usagePercent: number;
	message?: string;
}

/** Thresholds for budget warnings. */
const WARNING_THRESHOLD = 0.85;
const CRITICAL_THRESHOLD = 0.95;

/**
 * Rough token estimation for a messages array.
 * Uses ~4 chars per token heuristic. Tends to underestimate for CJK languages (1-2 chars/token).
 * Actual token count varies by model tokenizer, but this is sufficient for budget warnings.
 */
export function estimateTokens(messages: ReadonlyArray<{ role: string; content: string }>): number {
	const CHARS_PER_TOKEN = 4;
	const PER_MESSAGE_OVERHEAD = 4; // role + formatting tokens

	let total = 0;
	for (const msg of messages) {
		total += Math.ceil((msg.content?.length ?? 0) / CHARS_PER_TOKEN) + PER_MESSAGE_OVERHEAD;
	}
	return total;
}

/**
 * Check if the current message array is within the token budget for the given model.
 * Call this before every LLM request.
 */
export function checkTokenBudget(
	messages: ReadonlyArray<{ role: string; content: string }>,
	model: string,
	systemPrompt?: string,
): BudgetCheckResult {
	const contextWindow = getContextWindow(model);
	let estimated = estimateTokens(messages);

	// Add system prompt estimate
	if (systemPrompt) {
		estimated += Math.ceil(systemPrompt.length / 4) + 4;
	}

	const usagePercent = estimated / contextWindow;

	if (usagePercent >= CRITICAL_THRESHOLD) {
		return {
			status: "critical",
			estimatedTokens: estimated,
			contextWindow,
			usagePercent,
			message: `Token budget critical: ~${estimated} / ${contextWindow} tokens (${(usagePercent * 100).toFixed(0)}%). Session may fail.`,
		};
	}

	if (usagePercent >= WARNING_THRESHOLD) {
		return {
			status: "warning",
			estimatedTokens: estimated,
			contextWindow,
			usagePercent,
			message: `Token budget warning: ~${estimated} / ${contextWindow} tokens (${(usagePercent * 100).toFixed(0)}%). Consider starting a new session.`,
		};
	}

	return {
		status: "ok",
		estimatedTokens: estimated,
		contextWindow,
		usagePercent,
	};
}
