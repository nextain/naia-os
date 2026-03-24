/**
 * MemorySystem — Orchestrator for Alpha's memory architecture.
 *
 * Coordinates the 4-store memory system:
 * - Working Memory: managed by ContextManager (#65)
 * - Episodic Memory: timestamped events via MemoryAdapter
 * - Semantic Memory: facts/knowledge via MemoryAdapter
 * - Procedural Memory: skills/reflections via MemoryAdapter
 *
 * This class handles:
 * - Memory encoding (with importance gating)
 * - Memory retrieval (with context-dependent recall)
 * - Consolidation scheduling (sleep cycle analog)
 */

import { randomUUID } from "node:crypto";
import { scoreImportance, shouldStore } from "./importance.js";
import { findContradictions } from "./reconsolidation.js";
import type {
	ConsolidationResult,
	EncodingContext,
	Episode,
	Fact,
	MemoryAdapter,
	MemoryInput,
	RecallContext,
	Reflection,
} from "./types.js";

/**
 * Callback for extracting facts from episodes.
 * In production, this would call an LLM. For testing, a simple heuristic.
 */
export type FactExtractor = (episodes: Episode[]) => Promise<ExtractedFact[]>;

/** A fact extracted from episodes (before insertion) */
export interface ExtractedFact {
	content: string;
	entities: string[];
	topics: string[];
	importance: number;
	sourceEpisodeIds: string[];
}

export interface MemorySystemOptions {
	adapter: MemoryAdapter;
	/** Consolidation interval in ms (default: 30 minutes) */
	consolidationIntervalMs?: number;
	/** Custom fact extractor (default: heuristic). Inject LLM-based extractor in production. */
	factExtractor?: FactExtractor;
}

/**
 * Default heuristic fact extractor — no LLM needed.
 * Extracts "facts" by finding sentences with decision/preference keywords.
 */
async function heuristicFactExtractor(episodes: Episode[]): Promise<ExtractedFact[]> {
	const facts: ExtractedFact[] = [];
	const FACT_PATTERNS = [
		/(?:decided|decision|chose|prefer|always|never|must|use|switched)/i,
		/(?:결정|선택|항상|절대|반드시|사용|바꿨|변경)/,
	];

	for (const ep of episodes) {
		const hasFactPattern = FACT_PATTERNS.some((p) => p.test(ep.content));
		if (!hasFactPattern) continue;
		if (ep.importance.utility < 0.3) continue;

		// Extract simple entities: capitalized words or quoted strings
		const entities: string[] = [];
		const capWords = ep.content.match(/\b[A-Z][a-zA-Z]+(?:\.[a-zA-Z]+)?\b/g);
		if (capWords) {
			for (const w of capWords) {
				if (!["The", "This", "That", "What", "When", "How", "But", "And", "For"].includes(w)) {
					entities.push(w);
				}
			}
		}

		facts.push({
			content: ep.content.slice(0, 300),
			entities: [...new Set(entities)],
			topics: ep.encodingContext.project ? [ep.encodingContext.project] : [],
			importance: ep.importance.utility,
			sourceEpisodeIds: [ep.id],
		});
	}

	return facts;
}

export class MemorySystem {
	private readonly adapter: MemoryAdapter;
	private consolidationTimer: ReturnType<typeof setInterval> | null = null;
	private readonly consolidationIntervalMs: number;
	private readonly factExtractor: FactExtractor;
	private _isConsolidating = false;

	constructor(options: MemorySystemOptions) {
		this.adapter = options.adapter;
		this.consolidationIntervalMs = options.consolidationIntervalMs ?? 30 * 60 * 1000;
		this.factExtractor = options.factExtractor ?? heuristicFactExtractor;
	}

	/** Whether a consolidation cycle is currently running */
	get isConsolidating(): boolean {
		return this._isConsolidating;
	}

	// ─── Memory Encoding ──────────────────────────────────────────────────

	/**
	 * Encode a new memory from a conversation turn.
	 * Applies importance gating (amygdala analog) — low-utility inputs are dropped.
	 * Checks for contradictions with existing facts (reconsolidation).
	 *
	 * @returns The episode if stored, null if gated out
	 */
	async encode(
		input: MemoryInput,
		context: EncodingContext,
	): Promise<Episode | null> {
		const score = scoreImportance(input);

		if (!shouldStore(score)) {
			return null; // Gated out — not worth storing
		}

		const now = Date.now();
		const episode: Episode = {
			id: randomUUID(),
			content: input.content,
			summary: input.content.slice(0, 200),
			timestamp: now,
			importance: score,
			encodingContext: context,
			consolidated: false,
			recallCount: 0,
			lastAccessed: now,
			strength: score.utility,
		};

		await this.adapter.episode.store(episode);

		// Reconsolidation: check if new info contradicts existing facts
		// Runs for all stored messages — contradiction detection is cheap
		await this.checkAndReconsolidate(input.content, now);

		// Strengthen associations between entities in the encoding context
		if (context.project && context.activeFile) {
			await this.adapter.semantic.associate(context.project, context.activeFile);
		}

		return episode;
	}

	/**
	 * Check new information against existing facts for contradictions.
	 * Automatically updates facts when contradictions are detected (reconsolidation).
	 */
	private async checkAndReconsolidate(newInfo: string, now: number): Promise<void> {
		const allFacts = await this.adapter.semantic.getAll();
		const contradictions = findContradictions(allFacts, newInfo);

		for (const { fact, result } of contradictions) {
			if (result.action === "update" && result.updatedContent) {
				// Reconsolidate: update the fact with new information
				await this.adapter.semantic.upsert({
					...fact,
					content: result.updatedContent,
					updatedAt: now,
					importance: Math.max(fact.importance, 0.7), // Contradictions are important
				});
			}
			// flag_contradiction: for now, just let it be (future: notify user)
		}
	}

	// ─── Memory Retrieval ─────────────────────────────────────────────────

	/**
	 * Recall relevant memories for a query.
	 * Combines episodic recall + semantic search + procedural reflections.
	 * Implements Tulving's encoding specificity — context at retrieval matters.
	 */
	async recall(
		query: string,
		context: RecallContext,
	): Promise<{
		episodes: Episode[];
		facts: Fact[];
		reflections: Reflection[];
	}> {
		const topK = context.topK ?? 3;

		const [episodes, facts, reflections] = await Promise.all([
			this.adapter.episode.recall(query, context),
			this.adapter.semantic.search(query, topK),
			this.adapter.procedural.getReflections(query, topK),
		]);

		return { episodes, facts, reflections };
	}

	/**
	 * Auto-recall for session init (L6 analog).
	 * Retrieves relevant context before first LLM call of a new session.
	 */
	async sessionRecall(
		firstMessage: string,
		context: RecallContext,
	): Promise<string> {
		const { facts, reflections } = await this.recall(firstMessage, {
			...context,
			topK: 3,
		});

		if (facts.length === 0 && reflections.length === 0) return "";

		const parts: string[] = [];

		if (facts.length > 0) {
			parts.push("## 관련 기억");
			for (const fact of facts) {
				parts.push(`- ${fact.content}`);
			}
		}

		if (reflections.length > 0) {
			parts.push("## 과거 경험에서 배운 것");
			for (const ref of reflections) {
				parts.push(`- ${ref.task}: ${ref.correction}`);
			}
		}

		return parts.join("\n");
	}

	// ─── Procedural Learning ──────────────────────────────────────────────

	/**
	 * Record a task failure with self-reflection (Reflexion pattern).
	 */
	async reflectOnFailure(
		task: string,
		failure: string,
		analysis: string,
		correction: string,
	): Promise<void> {
		const reflection: Reflection = {
			task,
			failure,
			analysis,
			correction,
			timestamp: Date.now(),
		};
		await this.adapter.procedural.learnFromFailure(reflection);
	}

	// ─── Consolidation (Sleep Cycle) ──────────────────────────────────────

	/**
	 * Start the background consolidation timer.
	 * Runs periodically during idle time, like sleep-cycle memory consolidation.
	 *
	 * Neuroscience basis: during slow-wave sleep, the hippocampus replays
	 * recent experiences and transfers patterns to the neocortex.
	 */
	startConsolidation(): void {
		if (this.consolidationTimer) return;
		this.consolidationTimer = setInterval(async () => {
			try {
				await this.consolidateNow();
			} catch {
				// Non-critical — log and continue
			}
		}, this.consolidationIntervalMs);
	}

	/** Stop the consolidation timer */
	stopConsolidation(): void {
		if (this.consolidationTimer) {
			clearInterval(this.consolidationTimer);
			this.consolidationTimer = null;
		}
	}

	/**
	 * Run a full consolidation cycle on demand.
	 *
	 * Pipeline:
	 * 1. Extract facts from unconsolidated episodes (hippocampal replay)
	 * 2. Check extracted facts against existing facts (reconsolidation)
	 * 3. Upsert new/updated facts into semantic memory
	 * 4. Mark processed episodes as consolidated
	 * 5. Run adapter-level decay + association cleanup
	 */
	async consolidateNow(): Promise<ConsolidationResult> {
		if (this._isConsolidating) {
			return { episodesProcessed: 0, factsCreated: 0, factsUpdated: 0, memoriesPruned: 0, associationsUpdated: 0 };
		}
		this._isConsolidating = true;

		try {
			const now = Date.now();
			let factsCreated = 0;
			let factsUpdated = 0;

			// 1. Get unconsolidated episodes
			const unconsolidated = await this.adapter.episode.getUnconsolidated();
			const readyEpisodes = unconsolidated.filter(
				(ep) => now - ep.timestamp > 60 * 60 * 1000, // At least 1 hour old
			);

			if (readyEpisodes.length > 0) {
				// 2. Extract facts from episodes
				const extracted = await this.factExtractor(readyEpisodes);

				// 3. For each extracted fact, check contradictions and upsert
				const existingFacts = await this.adapter.semantic.getAll();

				for (const ef of extracted) {
					// Check if this contradicts existing facts
					const contradictions = findContradictions(existingFacts, ef.content);

					if (contradictions.length > 0) {
						// Update the first contradicted fact (reconsolidate)
						for (const { fact, result } of contradictions) {
							if (result.action === "update") {
								await this.adapter.semantic.upsert({
									...fact,
									content: ef.content,
									updatedAt: now,
									importance: Math.max(fact.importance, ef.importance),
									sourceEpisodes: [...new Set([...fact.sourceEpisodes, ...ef.sourceEpisodeIds])],
								});
								factsUpdated++;
							}
						}
					} else {
						// New fact — create
						const newFact: Fact = {
							id: randomUUID(),
							content: ef.content,
							entities: ef.entities,
							topics: ef.topics,
							createdAt: now,
							updatedAt: now,
							importance: ef.importance,
							recallCount: 0,
							lastAccessed: now,
							strength: ef.importance,
							sourceEpisodes: ef.sourceEpisodeIds,
						};
						await this.adapter.semantic.upsert(newFact);
						factsCreated++;
					}

					// Strengthen associations between extracted entities
					for (let i = 0; i < ef.entities.length; i++) {
						for (let j = i + 1; j < ef.entities.length; j++) {
							await this.adapter.semantic.associate(ef.entities[i], ef.entities[j], 0.05);
						}
					}
				}

				// 4. Mark episodes as consolidated
				await this.adapter.episode.markConsolidated(
					readyEpisodes.map((ep) => ep.id),
				);
			}

			// 5. Run adapter-level decay + cleanup
			const adapterResult = await this.adapter.consolidate();

			return {
				episodesProcessed: readyEpisodes.length,
				factsCreated,
				factsUpdated,
				memoriesPruned: adapterResult.memoriesPruned,
				associationsUpdated: adapterResult.associationsUpdated,
			};
		} finally {
			this._isConsolidating = false;
		}
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────

	async close(): Promise<void> {
		this.stopConsolidation();
		await this.adapter.close();
	}
}
