/**
 * LocalAdapter — JSON file-backed MemoryAdapter implementation.
 *
 * Always functional, no external dependencies.
 * Uses atomic write (write-to-temp + rename) for crash safety.
 * Suitable for desktop companion use — the data volume is manageable in JSON.
 *
 * Future: can be swapped to SQLite (better-sqlite3) if query performance
 * becomes a bottleneck. For now, simplicity wins (ChatGPT Memory approach).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { calculateStrength, shouldPrune } from "./decay.js";
import { type KGState, KnowledgeGraph, emptyKGState } from "./knowledge-graph.js";
import type {
	ConsolidationResult,
	Episode,
	Fact,
	MemoryAdapter,
	RecallContext,
	Reflection,
	Skill,
} from "./types.js";

/** On-disk schema for JSON persistence */
interface MemoryStore {
	version: 1;
	episodes: Episode[];
	facts: Fact[];
	skills: Skill[];
	reflections: Reflection[];
	/** Hebbian association weights: "entityA::entityB" → weight */
	associations: Record<string, number>;
	/** Knowledge graph state (Phase 2) */
	knowledgeGraph?: KGState;
}

function emptyStore(): MemoryStore {
	return {
		version: 1,
		episodes: [],
		facts: [],
		skills: [],
		reflections: [],
		associations: {},
	};
}

/** Normalize association key (alphabetical order for consistency) */
function assocKey(a: string, b: string): string {
	const sorted = [a.toLowerCase(), b.toLowerCase()].sort();
	return `${sorted[0]}::${sorted[1]}`;
}

/** Simple keyword tokenizer for search */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1);
}

/**
 * Score relevance of a document to a query.
 * Uses substring matching as fallback for Korean particles (e.g., "TypeScript로")
 * and partial matches that exact tokenization misses.
 */
function keywordScore(query: string, document: string): number {
	const queryTokens = tokenize(query);
	const docLower = document.toLowerCase();
	const docTokens = new Set(tokenize(document));
	if (queryTokens.length === 0) return 0;

	let hits = 0;
	for (const qt of queryTokens) {
		if (docTokens.has(qt)) {
			hits++;
		} else if (docLower.includes(qt)) {
			// Substring match — handles Korean particles (TypeScript로, Cursor로)
			hits += 0.8;
		}
	}
	return hits / queryTokens.length;
}

export class LocalAdapter implements MemoryAdapter {
	private store: MemoryStore;
	private readonly storePath: string;
	private dirty = false;
	private readonly kg: KnowledgeGraph;

	constructor(storePath?: string) {
		this.storePath =
			storePath ?? join(homedir(), ".naia", "memory", "alpha-memory.json");
		this.store = this.load();
		// Initialize knowledge graph from persisted state
		if (!this.store.knowledgeGraph) {
			this.store.knowledgeGraph = emptyKGState();
		}
		this.kg = new KnowledgeGraph(this.store.knowledgeGraph);
	}

	// ─── Persistence ──────────────────────────────────────────────────────

	private load(): MemoryStore {
		try {
			if (existsSync(this.storePath)) {
				const raw = readFileSync(this.storePath, "utf-8");
				const parsed = JSON.parse(raw) as MemoryStore;
				if (parsed.version === 1) return parsed;
			}
		} catch {
			// Corrupted file — start fresh
		}
		return emptyStore();
	}

	private save(): void {
		if (!this.dirty) return;
		const dir = dirname(this.storePath);
		mkdirSync(dir, { recursive: true });
		const tmpPath = `${this.storePath}.tmp`;
		writeFileSync(tmpPath, JSON.stringify(this.store, null, "\t"), "utf-8");
		renameSync(tmpPath, this.storePath);
		this.dirty = false;
	}

	private markDirty(): void {
		this.dirty = true;
	}

	// ─── Episodic Memory ──────────────────────────────────────────────────

	episode = {
		store: async (event: Episode): Promise<void> => {
			this.store.episodes.push(event);
			this.markDirty();
			this.save();
		},

		recall: async (query: string, context: RecallContext): Promise<Episode[]> => {
			const now = Date.now();
			const topK = context.topK ?? 5;
			const minStrength = context.minStrength ?? 0.05;

			const scored = this.store.episodes
				.map((ep) => {
					// Recalculate strength with current time
					const strength = calculateStrength(
						ep.importance.utility,
						ep.timestamp,
						ep.recallCount,
						ep.lastAccessed,
						now,
					);

					if (strength < minStrength) return null;

					// Keyword relevance
					const textScore = keywordScore(query, `${ep.content} ${ep.summary}`);

					// Context bonus (encoding specificity)
					let contextBonus = 0;
					if (context.project && ep.encodingContext.project === context.project) {
						contextBonus += 0.2;
					}
					if (context.activeFile && ep.encodingContext.activeFile === context.activeFile) {
						contextBonus += 0.1;
					}

					const finalScore = textScore * strength + contextBonus;
					return { episode: ep, score: finalScore, strength };
				})
				.filter((x): x is NonNullable<typeof x> => x !== null && x.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, topK);

			// Update recall counts (reconsolidation: retrieval strengthens memory)
			for (const { episode } of scored) {
				episode.recallCount++;
				episode.lastAccessed = now;
				episode.strength = calculateStrength(
					episode.importance.utility,
					episode.timestamp,
					episode.recallCount,
					episode.lastAccessed,
					now,
				);
			}
			if (scored.length > 0) {
				this.markDirty();
				this.save();
			}

			return scored.map((s) => s.episode);
		},

		getRecent: async (n: number): Promise<Episode[]> => {
			return this.store.episodes
				.slice()
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, n);
		},

		getUnconsolidated: async (): Promise<Episode[]> => {
			return this.store.episodes.filter((ep) => !ep.consolidated);
		},

		markConsolidated: async (ids: string[]): Promise<void> => {
			const idSet = new Set(ids);
			for (const ep of this.store.episodes) {
				if (idSet.has(ep.id)) {
					ep.consolidated = true;
				}
			}
			this.markDirty();
			this.save();
		},
	};

	// ─── Semantic Memory ──────────────────────────────────────────────────

	semantic = {
		upsert: async (fact: Fact): Promise<void> => {
			const now = Date.now();
			const existing = this.store.facts.find((f) => f.id === fact.id);
			if (existing) {
				// Reconsolidation: update content, merge entities/topics, refresh timestamp
				existing.content = fact.content;
				existing.entities = [...new Set([...existing.entities, ...fact.entities])];
				existing.topics = [...new Set([...existing.topics, ...fact.topics])];
				existing.updatedAt = fact.updatedAt;
				existing.importance = Math.max(existing.importance, fact.importance);
				existing.sourceEpisodes = [
					...new Set([...existing.sourceEpisodes, ...fact.sourceEpisodes]),
				];
			} else {
				this.store.facts.push(fact);
			}

			// Register entities in knowledge graph and strengthen co-occurrence edges
			const entities = existing?.entities ?? fact.entities;
			for (const entity of entities) {
				this.kg.touchNode(entity, now);
			}
			// Strengthen edges between all entity pairs in this fact (Hebbian)
			for (let i = 0; i < entities.length; i++) {
				for (let j = i + 1; j < entities.length; j++) {
					this.kg.strengthen(entities[i], entities[j], 0.05, now);
				}
			}

			this.markDirty();
			this.save();
		},

		search: async (query: string, topK: number): Promise<Fact[]> => {
			const now = Date.now();
			const queryTokens = tokenize(query);

			// Spreading activation: find related entities via knowledge graph
			const activatedEntities = this.kg.spreadingActivation(queryTokens, 2, 0.5);
			const activationMap = new Map<string, number>();
			for (const { entity, activation } of activatedEntities) {
				activationMap.set(entity, activation);
			}

			const scored = this.store.facts
				.map((fact) => {
					const strength = calculateStrength(
						fact.importance,
						fact.createdAt,
						fact.recallCount,
						fact.lastAccessed,
						now,
					);

					// Keyword match on content + entities + topics
					const searchText = [
						fact.content,
						...fact.entities,
						...fact.topics,
					].join(" ");
					const textScore = keywordScore(query, searchText);

					// Entity exact match bonus
					let entityBonus = 0;
					for (const qt of queryTokens) {
						if (fact.entities.some((e) => e.toLowerCase().includes(qt))) {
							entityBonus += 0.15;
						}
					}

					// Spreading activation bonus: boost facts with associated entities
					let activationBonus = 0;
					for (const entity of fact.entities) {
						const act = activationMap.get(entity.toLowerCase());
						if (act) activationBonus += act * 0.1;
					}

					const finalScore = (textScore + entityBonus + activationBonus) * strength;
					return { fact, score: finalScore, strength };
				})
				.filter((x) => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, topK);

			// Update recall counts
			for (const { fact } of scored) {
				fact.recallCount++;
				fact.lastAccessed = now;
				fact.strength = calculateStrength(
					fact.importance,
					fact.createdAt,
					fact.recallCount,
					fact.lastAccessed,
					now,
				);
			}
			if (scored.length > 0) {
				this.markDirty();
				this.save();
			}

			return scored.map((s) => s.fact);
		},

		decay: async (now: number): Promise<number> => {
			const before = this.store.facts.length;
			this.store.facts = this.store.facts.filter((fact) => {
				const strength = calculateStrength(
					fact.importance,
					fact.createdAt,
					fact.recallCount,
					fact.lastAccessed,
					now,
				);
				fact.strength = strength;
				return !shouldPrune(strength);
			});
			const pruned = before - this.store.facts.length;

			// Also decay episodes
			const epBefore = this.store.episodes.length;
			this.store.episodes = this.store.episodes.filter((ep) => {
				const strength = calculateStrength(
					ep.importance.utility,
					ep.timestamp,
					ep.recallCount,
					ep.lastAccessed,
					now,
				);
				ep.strength = strength;
				// Keep consolidated episodes longer (they've contributed to semantic memory)
				return !shouldPrune(strength) || ep.consolidated;
			});
			const totalPruned = pruned + (epBefore - this.store.episodes.length);

			if (totalPruned > 0) {
				this.markDirty();
				this.save();
			}
			return totalPruned;
		},

		associate: async (entityA: string, entityB: string, weight = 0.1): Promise<void> => {
			const key = assocKey(entityA, entityB);
			const current = this.store.associations[key] ?? 0;
			// Hebbian: strengthen on co-access, cap at 1.0
			this.store.associations[key] = Math.min(1.0, current + weight);
			// Also update knowledge graph
			this.kg.strengthen(entityA, entityB, weight);
			this.markDirty();
			this.save();
		},

		getAll: async (): Promise<Fact[]> => {
			return [...this.store.facts];
		},
	};

	// ─── Procedural Memory ────────────────────────────────────────────────

	procedural = {
		getSkill: async (name: string): Promise<Skill | null> => {
			return this.store.skills.find((s) => s.name === name) ?? null;
		},

		recordOutcome: async (name: string, success: boolean): Promise<void> => {
			const skill = this.store.skills.find((s) => s.name === name);
			if (skill) {
				if (success) skill.successCount++;
				else skill.failureCount++;
				skill.confidence =
					skill.successCount / (skill.successCount + skill.failureCount);
			} else {
				this.store.skills.push({
					id: randomUUID(),
					name,
					description: "",
					learnedAt: Date.now(),
					successCount: success ? 1 : 0,
					failureCount: success ? 0 : 1,
					confidence: success ? 1.0 : 0.0,
				});
			}
			this.markDirty();
			this.save();
		},

		learnFromFailure: async (reflection: Reflection): Promise<void> => {
			this.store.reflections.push(reflection);
			this.markDirty();
			this.save();
		},

		getReflections: async (task: string, topK: number): Promise<Reflection[]> => {
			return this.store.reflections
				.map((r) => ({
					reflection: r,
					score: keywordScore(task, `${r.task} ${r.failure} ${r.analysis}`),
				}))
				.filter((x) => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, topK)
				.map((x) => x.reflection);
		},
	};

	// ─── Consolidation ────────────────────────────────────────────────────

	async consolidate(): Promise<ConsolidationResult> {
		const result: ConsolidationResult = {
			episodesProcessed: 0,
			factsCreated: 0,
			factsUpdated: 0,
			memoriesPruned: 0,
			associationsUpdated: 0,
		};

		const now = Date.now();

		// 1. Decay sweep
		result.memoriesPruned = await this.semantic.decay(now);

		// 2. Association decay (Hebbian: unused associations weaken)
		const keysToRemove: string[] = [];
		for (const [key, weight] of Object.entries(this.store.associations)) {
			const decayed = weight * 0.95; // 5% decay per consolidation cycle
			if (decayed < 0.01) {
				keysToRemove.push(key);
			} else {
				this.store.associations[key] = decayed;
				result.associationsUpdated++;
			}
		}
		for (const key of keysToRemove) {
			delete this.store.associations[key];
		}

		// 3. Knowledge graph edge decay
		result.associationsUpdated += this.kg.decayEdges(0.95, 0.01);

		// 3. Mark unconsolidated episodes older than 1 hour as ready for extraction
		// (actual fact extraction requires LLM — done by MemorySystem, not adapter)
		const unconsolidated = this.store.episodes.filter(
			(ep) => !ep.consolidated && now - ep.timestamp > 60 * 60 * 1000,
		);
		result.episodesProcessed = unconsolidated.length;

		this.markDirty();
		this.save();

		return result;
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────

	async close(): Promise<void> {
		this.save();
	}

	// ─── Testing Helpers ──────────────────────────────────────────────────

	/** Get raw store for testing/debugging */
	getStore(): Readonly<MemoryStore> {
		return this.store;
	}

	/** Get knowledge graph for direct queries */
	getKnowledgeGraph(): KnowledgeGraph {
		return this.kg;
	}

	/** Reset all memory (testing only) */
	reset(): void {
		this.store = emptyStore();
		this.markDirty();
		this.save();
	}
}
