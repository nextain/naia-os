/**
 * Memory Reconsolidation — update memories when recalled.
 *
 * Neuroscience basis (Nader et al. 2000):
 * When a consolidated memory is reactivated (recalled), it enters a
 * temporarily labile state. During this window, the memory can be
 * strengthened, weakened, or updated with new information.
 *
 * Implementation:
 * - On retrieval, compare existing fact against current context
 * - Detect contradictions using keyword overlap + negation patterns
 * - Update (reconsolidate) or flag for review
 *
 * Also inspired by:
 * - Zep bi-temporal model (invalidate, don't delete)
 * - mem0 ADD/UPDATE/DELETE/NOOP pipeline
 */

import type { Fact } from "./types.js";

/** Result of a reconsolidation check */
export interface ReconsolidationResult {
	/** What action to take */
	action: "keep" | "update" | "flag_contradiction";
	/** If update: the updated fact content */
	updatedContent?: string;
	/** Human-readable reason for the action */
	reason: string;
}

/** Negation patterns that signal a contradiction */
const NEGATION_PATTERNS = [
	// English
	/\bnot\b/i,
	/\bno longer\b/i,
	/\bdon't\b/i,
	/\bdoesn't\b/i,
	/\bstopped\b/i,
	/\bswitched\b/i,
	/\bchanged\b/i,
	/\binstead\b/i,
	/\breplaced\b/i,
	/\bactually\b/i,
	// Korean
	/아니[라고]/,
	/않/,
	/바꿨/,
	/변경/,
	/대신/,
	/그만/,
];

/** Preference/state verbs that indicate updatable facts */
const STATE_VERBS = [
	"prefer", "use", "like", "want", "work with", "live in", "work at",
	"좋아", "사용", "쓰", "원", "살", "일하",
];

/**
 * Check if a new piece of information contradicts an existing fact.
 * Uses heuristic detection (no LLM needed).
 *
 * @param existingFact - The stored fact
 * @param newInfo - The new information to compare against
 * @returns Reconsolidation action
 */
export function checkContradiction(
	existingFact: Fact,
	newInfo: string,
): ReconsolidationResult {
	const existingLower = existingFact.content.toLowerCase();
	const newLower = newInfo.toLowerCase();

	// 1. Check for shared entities — only compare if they're about the same thing
	const sharedEntities = existingFact.entities.filter((e) =>
		newLower.includes(e.toLowerCase()),
	);
	if (sharedEntities.length === 0) {
		return { action: "keep", reason: "No shared entities — unrelated" };
	}

	// 2. Check for negation patterns in new info that reference the existing fact
	const hasNegation = NEGATION_PATTERNS.some((pattern) => pattern.test(newLower));

	// 3. Check for state verb overlap (preference/state facts are update candidates)
	const isStateFact = STATE_VERBS.some(
		(verb) => existingLower.includes(verb) || newLower.includes(verb),
	);

	// 4. High keyword overlap + negation = likely contradiction
	const existingTokens = new Set(tokenizeSimple(existingLower));
	const newTokens = tokenizeSimple(newLower);
	let overlapCount = 0;
	for (const token of newTokens) {
		if (existingTokens.has(token)) overlapCount++;
	}
	const overlapRatio = newTokens.length > 0 ? overlapCount / newTokens.length : 0;

	if (hasNegation && overlapRatio > 0.3) {
		return {
			action: "update",
			updatedContent: newInfo,
			reason: `Contradiction detected: negation pattern with ${Math.round(overlapRatio * 100)}% topic overlap on entities [${sharedEntities.join(", ")}]`,
		};
	}

	if (isStateFact && hasNegation) {
		return {
			action: "update",
			updatedContent: newInfo,
			reason: `State change detected: preference/state fact with negation on entities [${sharedEntities.join(", ")}]`,
		};
	}

	if (overlapRatio > 0.5 && hasNegation) {
		return {
			action: "flag_contradiction",
			reason: `Possible contradiction: high overlap (${Math.round(overlapRatio * 100)}%) with negation — needs verification`,
		};
	}

	return { action: "keep", reason: "No contradiction detected" };
}

/**
 * Find facts that may conflict with new information.
 *
 * @param facts - All stored facts
 * @param newInfo - New information to check against
 * @returns Facts that have potential contradictions
 */
export function findContradictions(
	facts: Fact[],
	newInfo: string,
): Array<{ fact: Fact; result: ReconsolidationResult }> {
	return facts
		.map((fact) => ({
			fact,
			result: checkContradiction(fact, newInfo),
		}))
		.filter(({ result }) => result.action !== "keep");
}

/** Simple tokenizer for contradiction checking */
function tokenizeSimple(text: string): string[] {
	return text
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1);
}
