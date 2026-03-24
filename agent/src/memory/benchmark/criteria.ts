/**
 * Alpha Memory System — Testing Criteria & Thresholds
 *
 * Three categories:
 * 1. Industry-standard (from published benchmarks — LoCoMo, LongMemEval, etc.)
 * 2. Adopted-standard (from research papers with published thresholds — A-MAC, DeepEval)
 * 3. Alpha-original (our own criteria for concepts with no existing standards)
 *
 * Sources documented per criterion.
 */

// ─── 1. Industry-Standard Criteria ──────────────────────────────────────────
// Criteria from published benchmarks with established thresholds.

export const INDUSTRY_CRITERIA = {
	/**
	 * Single-hop factual retrieval accuracy.
	 * Source: Deep Memory Retrieval (Letta), Zep 94.8%, GPT-4T 98.2%
	 * Our target: ≥90% (production-ready tier)
	 */
	singleHopRetrieval: { target: 0.9, minimum: 0.8, metric: "accuracy" },

	/**
	 * Knowledge update accuracy — correctly reflecting changed facts.
	 * Source: LongMemEval Knowledge Update category, Zep 83.3%
	 * Weakest category across all systems. Our target: ≥75%
	 */
	knowledgeUpdate: { target: 0.75, minimum: 0.6, metric: "accuracy" },

	/**
	 * Abstention — correctly refusing to answer about non-existent memories.
	 * Source: LongMemEval, LoCoMo adversarial questions
	 * Our target: ≥85% (high — hallucinated memories are dangerous)
	 */
	abstention: { target: 0.85, minimum: 0.7, metric: "accuracy" },

	/**
	 * Multi-session reasoning — connecting facts across sessions.
	 * Source: LongMemEval, Zep 57.9%, Hindsight 91.4%
	 * Our target: ≥65% (functional tier)
	 */
	multiSessionReasoning: { target: 0.65, minimum: 0.5, metric: "accuracy" },

	/**
	 * Knowledge retention across conversation turns.
	 * Source: DeepEval Knowledge Retention metric
	 * Formula: turns_without_attrition / total_assistant_turns
	 * Our target: ≥0.7 (strict mode)
	 */
	knowledgeRetention: { target: 0.7, minimum: 0.5, metric: "ratio" },
} as const;

// ─── 2. Adopted-Standard Criteria ───────────────────────────────────────────
// Criteria from research papers with published thresholds, adapted to our system.

export const ADOPTED_CRITERIA = {
	/**
	 * Memory admission (importance gating) F1 score.
	 * Source: A-MAC (March 2026, arxiv 2603.04549)
	 * A-MAC optimal: F1=0.583 at θ=0.55, recall=0.972
	 * Our target: recall ≥0.9 (never miss important), precision ≥0.4 (accept some noise)
	 */
	importanceGating: {
		target: { precision: 0.4, recall: 0.9, f1: 0.55 },
		minimum: { precision: 0.3, recall: 0.8, f1: 0.4 },
		metric: "precision_recall_f1",
	},

	/**
	 * Temporal reasoning accuracy.
	 * Source: LongMemEval temporal category, Zep 62.4%
	 * Our target: ≥60%
	 */
	temporalReasoning: { target: 0.6, minimum: 0.45, metric: "accuracy" },
} as const;

// ─── 3. Alpha-Original Criteria ─────────────────────────────────────────────
// Our own criteria for neuroscience-inspired concepts with NO existing standards.
// These are the first published thresholds for these capabilities.

export const ALPHA_CRITERIA = {
	/**
	 * Ebbinghaus decay curve accuracy.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * Tests that memory strength at time t matches the theoretical curve
	 * R(t) = importance × e^(-λ_eff × t) × (1 + recalls × boost)
	 * within an acceptable tolerance.
	 *
	 * Methodology: Create memories at known timestamps, measure strength
	 * at fixed intervals, compute R² against theoretical curve.
	 *
	 * Target: R² ≥ 0.95 (curve follows theory closely)
	 */
	decayCurveAccuracy: { target: 0.95, minimum: 0.9, metric: "r_squared" },

	/**
	 * Recall strengthening effect.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * After N recalls, memory strength should be measurably higher
	 * than an unrecalled memory of the same age and importance.
	 *
	 * Target: ≥30% strength increase after 3 recalls
	 */
	recallStrengthening: { target: 0.3, minimum: 0.15, metric: "relative_increase" },

	/**
	 * Spreading activation precision@k.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * Given seed entities, does activation reach expected related entities
	 * within the top-k results?
	 *
	 * Methodology: Build known graph topology, seed specific nodes,
	 * verify that expected targets appear in top-k activated entities.
	 *
	 * Target: precision@5 ≥ 0.6
	 */
	spreadingActivation: { target: 0.6, minimum: 0.4, metric: "precision_at_k" },

	/**
	 * Hebbian association strength correlation.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * Entities that frequently co-occur should have stronger associations
	 * than entities that rarely co-occur. Spearman rank correlation between
	 * co-occurrence frequency and edge weight.
	 *
	 * Target: ρ ≥ 0.7
	 */
	hebbianCorrelation: { target: 0.7, minimum: 0.5, metric: "spearman_rho" },

	/**
	 * Contradiction detection recall.
	 * NO EXISTING STANDARD with threshold — Alpha-original criterion.
	 * (MemoryAgentBench CR-Acc exists but publishes no threshold)
	 *
	 * When a new fact contradicts an existing fact, the system must detect it.
	 * Missing a contradiction is worse than a false positive.
	 *
	 * Target: recall ≥ 0.8, precision ≥ 0.5
	 */
	contradictionDetection: {
		target: { precision: 0.5, recall: 0.8 },
		minimum: { precision: 0.3, recall: 0.6 },
		metric: "precision_recall",
	},

	/**
	 * Reconsolidation correctness.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * When a fact is updated via reconsolidation:
	 * 1. The old version must be replaced (not duplicated)
	 * 2. The new version must be retrievable
	 * 3. Unrelated facts must not be affected
	 *
	 * Target: 100% on all three sub-criteria (deterministic behavior)
	 */
	reconsolidation: { target: 1.0, minimum: 0.9, metric: "pass_rate" },

	/**
	 * Consolidation compression ratio.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * How many episodes are compressed into how many semantic facts.
	 * Too low = no compression. Too high = information loss.
	 *
	 * Target: 3:1 to 10:1 (3-10 episodes per fact)
	 */
	consolidationCompression: {
		target: { min: 3, max: 10 },
		minimum: { min: 1, max: 20 },
		metric: "ratio_range",
	},

	/**
	 * Context-dependent retrieval boost.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 * Based on Tulving's encoding specificity principle.
	 *
	 * Memories retrieved with matching context (same project, file)
	 * should rank higher than identical memories with mismatched context.
	 *
	 * Target: context-matched memories rank in top-50% of results
	 */
	contextDependentRetrieval: { target: 0.5, minimum: 0.3, metric: "top_ratio" },

	/**
	 * Importance-retention correlation.
	 * NO EXISTING STANDARD — Alpha-original criterion.
	 *
	 * After a decay sweep, high-importance memories should survive
	 * preferentially. Correlation between initial importance and survival.
	 *
	 * Target: point-biserial correlation r ≥ 0.5
	 */
	importanceRetention: { target: 0.5, minimum: 0.3, metric: "correlation" },
} as const;

// ─── Report Types ───────────────────────────────────────────────────────────

export type CriterionCategory = "industry" | "adopted" | "alpha-original";

export interface BenchmarkResult {
	criterion: string;
	category: CriterionCategory;
	metric: string;
	value: number | Record<string, number>;
	target: number | Record<string, number>;
	minimum: number | Record<string, number>;
	passed: boolean;
	/** "pass" | "warn" (above minimum but below target) | "fail" */
	grade: "pass" | "warn" | "fail";
}

export interface BenchmarkReport {
	timestamp: string;
	version: string;
	summary: {
		total: number;
		passed: number;
		warned: number;
		failed: number;
		passRate: number;
	};
	results: BenchmarkResult[];
}
