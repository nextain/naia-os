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

	// Also check for significant content keyword overlap (catches cases where
	// the new info doesn't mention the old entity, e.g., "에디터 Cursor로 바꿨어"
	// without repeating "Neovim")
	// Uses substring matching to handle Korean particles (는, 을, 로, etc.)
	// Min token length 3 to avoid false positives like "use" in "because"
	const existingContentTokens = tokenizeSimple(existingLower);
	const newContentTokens = tokenizeSimple(newLower);
	let contentOverlapCount = 0;
	for (const nt of newContentTokens) {
		if (nt.length < 3) continue; // Skip very short tokens to prevent false positive substrings
		const hasMatch = existingContentTokens.some((et) => {
			if (et.length < 3) return false;
			// Exact match
			if (et === nt) return true;
			// Substring match only if the shorter token is at least 3 chars
			// and at least 60% of the longer token (avoids "port" in "important")
			const shorter = et.length < nt.length ? et : nt;
			const longer = et.length < nt.length ? nt : et;
			return longer.includes(shorter) && shorter.length / longer.length >= 0.6;
		});
		if (hasMatch) contentOverlapCount++;
	}
	// Require at least 2 overlapping tokens, or 1 if tokens are few
	const minOverlap = Math.max(1, Math.min(2, Math.floor(newContentTokens.length * 0.15)));
	const hasContentOverlap = contentOverlapCount >= minOverlap && newContentTokens.length > 0;

	if (sharedEntities.length === 0 && !hasContentOverlap) {
		return { action: "keep", reason: "No shared entities or content overlap — unrelated" };
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
			reason: `Contradiction detected: negation pattern with ${Math.round(overlapRatio * 100)}% topic overlap${sharedEntities.length > 0 ? ` on entities [${sharedEntities.join(", ")}]` : " (content overlap)"}`,
		};
	}

	if (isStateFact && hasNegation) {
		return {
			action: "update",
			updatedContent: newInfo,
			reason: `State change detected: preference/state fact with negation${sharedEntities.length > 0 ? ` on entities [${sharedEntities.join(", ")}]` : " (content overlap)"}`,
		};
	}

	// Note: "flag_contradiction" for high overlap without state verb is subsumed by
	// the overlapRatio > 0.3 check above. If future logic changes the threshold,
	// re-evaluate whether a separate flag_contradiction branch is needed.

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
