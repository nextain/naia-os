/**
 * Ebbinghaus Forgetting Curve Implementation
 *
 * Models memory strength decay over time:
 *   strength = importance × e^(-λ_eff × days) × (1 + recallCount × RECALL_BOOST)
 *
 * Where λ_eff = BASE_DECAY × (1 - importance × IMPORTANCE_DAMPING)
 * High-importance memories decay slower; frequently recalled memories persist longer.
 *
 * Based on: Ebbinghaus (1885), YourMemory implementation, FOREVER (2025)
 */

/** Base decay rate per day (λ). Higher = faster forgetting.
 * 0.08: high-importance (0.7+) memories survive 60+ days without recall.
 * Previous value 0.16 was too aggressive — user's name forgotten in 2 months. */
export const BASE_DECAY = 0.08;

/** How much importance slows decay (0–1). At 0.85, max-importance decays at 23.5% of base rate.
 * Higher damping = important memories decay much slower than trivial ones. */
export const IMPORTANCE_DAMPING = 0.85;

/** Strength boost per recall event. Each recall adds this fraction to the multiplier. */
const RECALL_BOOST = 0.2;

/** Below this strength, memories are candidates for pruning. */
export const PRUNE_THRESHOLD = 0.05;

/** Minimum strength floor — prevents instant pruning of just-created memories */
const MIN_STRENGTH = 0.01;

/**
 * Calculate current memory strength using Ebbinghaus forgetting curve.
 *
 * @param importance - Base importance score (0.0–1.0)
 * @param createdAt - Timestamp when memory was created (ms)
 * @param recallCount - Number of times memory has been recalled
 * @param lastAccessed - Timestamp of most recent access (ms)
 * @param now - Current timestamp (ms)
 * @returns Current memory strength (0.0–1.0+, may exceed 1.0 for highly recalled memories)
 */
export function calculateStrength(
	importance: number,
	createdAt: number,
	recallCount: number,
	lastAccessed: number,
	now: number,
): number {
	// Use time since last access (not creation) — each recall resets the decay clock
	const daysSinceAccess = Math.max(0, (now - lastAccessed) / (1000 * 60 * 60 * 24));

	// Effective decay rate: high importance → slower decay
	const lambdaEff = BASE_DECAY * (1 - importance * IMPORTANCE_DAMPING);

	// Core Ebbinghaus formula with recall boost
	const decayFactor = Math.exp(-lambdaEff * daysSinceAccess);
	const recallMultiplier = 1 + recallCount * RECALL_BOOST;

	const strength = importance * decayFactor * recallMultiplier;

	return Math.max(MIN_STRENGTH, strength);
}

/**
 * Calculate time-weighted prune score for L1 tool output pruning.
 * Older items get higher scores (pruned first).
 *
 * @param tokenSize - Number of tokens in this item
 * @param hoursSince - Hours since the item was created
 * @returns Prune priority score (higher = prune first)
 */
export function calculatePruneScore(tokenSize: number, hoursSince: number): number {
	const ageWeight = 1 + Math.log(Math.max(1, hoursSince));
	return tokenSize * ageWeight;
}

/**
 * Determine if a memory should be pruned based on its current strength.
 */
export function shouldPrune(strength: number): boolean {
	return strength < PRUNE_THRESHOLD;
}
