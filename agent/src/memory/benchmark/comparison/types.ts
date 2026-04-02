/**
 * BenchmarkAdapter — unified interface for comparing memory systems.
 *
 * Each adapter wraps one memory system and exposes only two operations:
 *   1. addFact(content) — store a fact/memory
 *   2. search(query, topK) — retrieve relevant memories as plain strings
 *
 * This keeps comparison fair: same facts in, same queries out.
 */
export interface BenchmarkAdapter {
	/** Human-readable name for reports */
	readonly name: string;

	/** One-line description */
	readonly description: string;

	/** Initialize the adapter (create DB, start server, etc.)
	 *  cacheId: fixed ID for DB path reuse (skip-encode mode) */
	init(cacheId?: string): Promise<void>;

	/** Store a fact. Returns true if stored, false if filtered/gated. */
	addFact(content: string): Promise<boolean>;

	/** Search for relevant memories. Returns plain text strings. */
	search(query: string, topK: number): Promise<string[]>;

	/** Cleanup (close connections, remove temp files, stop containers) */
	cleanup(): Promise<void>;
}

export interface ComparisonResult {
	adapter: string;
	description: string;
	core: { total: number; passed: number; rate: number };
	bonus: { total: number; passed: number };
	grade: string;
	byCapability: Record<
		string,
		{ passed: number; total: number; weight: number }
	>;
	details: TestDetail[];
}

export interface TestDetail {
	id: string;
	capability: string;
	query: string;
	weight: number;
	isBonus: boolean;
	pass: boolean;
	reason: string;
	memories: string[];
	response: string;
}
