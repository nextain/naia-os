/**
 * Mem0Adapter — mem0 OSS-backed MemoryAdapter implementation.
 *
 * Uses mem0ai/oss as the vector search/storage backend.
 * Existing neuroscience modules (decay, importance, knowledge-graph)
 * remain as layers on top — mem0 replaces keyword matching, not the architecture.
 *
 * Architecture decision (2026-03-26 design session):
 * - mem0 handles: embedding, vector storage, LLM-based fact extraction, semantic search
 * - Naia keeps: decay curves, importance gating, knowledge graph, reconsolidation logic
 *
 * Privacy: All mem0 operations run locally (OSS mode).
 * No user data leaves the device.
 */

import { randomUUID } from "node:crypto";
import { calculateStrength, shouldPrune } from "./decay.js";
import { KnowledgeGraph, emptyKGState, type KGState } from "./knowledge-graph.js";
import type {
	ConsolidationResult,
	Episode,
	Fact,
	MemoryAdapter,
	RecallContext,
	Reflection,
	Skill,
} from "./types.js";

// mem0 types (imported dynamically to avoid bundling issues)
type Mem0Memory = any; // Will be import("mem0ai/oss").Memory

export interface Mem0AdapterOptions {
	/** mem0 OSS configuration */
	mem0Config: {
		embedder: { provider: string; config: Record<string, any> };
		vectorStore: { provider: string; config: Record<string, any> };
		llm: { provider: string; config: Record<string, any> };
		historyDbPath?: string;
	};
	/** User ID for mem0 scoping */
	userId?: string;
}

/**
 * Adapter that wraps mem0 as the vector search backend while preserving
 * Naia's neuroscience-inspired memory modules on top.
 */
export class Mem0Adapter implements MemoryAdapter {
	private mem0: Mem0Memory | null = null;
	private initPromise: Promise<void> | null = null;
	private readonly config: Mem0AdapterOptions;
	private readonly userId: string;

	// Local stores for Naia-specific data that mem0 doesn't handle
	private episodes: Episode[] = [];
	private skills: Skill[] = [];
	private reflections: Reflection[] = [];
	private kg: KnowledgeGraph;
	private kgState: KGState;

	constructor(options: Mem0AdapterOptions) {
		this.config = options;
		this.userId = options.userId ?? "naia-user";
		this.kgState = emptyKGState();
		this.kg = new KnowledgeGraph(this.kgState);
	}

	private async ensureMem0(): Promise<Mem0Memory> {
		if (this.mem0) return this.mem0;
		if (this.initPromise) {
			await this.initPromise;
			return this.mem0!;
		}
		this.initPromise = this._initMem0();
		await this.initPromise;
		return this.mem0!;
	}

	private async _initMem0(): Promise<void> {
		const { Memory } = await import("mem0ai/oss");
		this.mem0 = new Memory(this.config.mem0Config);
	}

	// ─── Episodic Memory ─────────────────────────────────────────────────

	episode = {
		store: async (event: Episode): Promise<void> => {
			this.episodes.push(event);

			// Also store in mem0 for vector search
			const m = await this.ensureMem0();
			await m.add(
				[{ role: "user", content: event.content }],
				{
					userId: this.userId,
					metadata: {
						type: "episode",
						episodeId: event.id,
						project: event.encodingContext.project,
						timestamp: event.timestamp,
					},
				},
			);
		},

		recall: async (query: string, context: RecallContext): Promise<Episode[]> => {
			const topK = context.topK ?? 5;

			// Use mem0 vector search instead of keyword matching
			const m = await this.ensureMem0();
			const results = await m.search(query, {
				userId: this.userId,
				limit: topK,
			});

			// Map mem0 results back to episodes
			const matchedEpisodes: Episode[] = [];
			const resultItems = results?.results ?? results ?? [];

			for (const r of resultItems) {
				const memoryText = r.memory ?? r.text ?? r.content ?? "";
				// Find matching episode by content similarity
				const match = this.episodes.find(
					(ep) => ep.content === memoryText ||
						memoryText.includes(ep.content.slice(0, 50)) ||
						ep.content.includes(memoryText.slice(0, 50)),
				);
				if (match) {
					match.recallCount++;
					match.lastAccessed = Date.now();
					matchedEpisodes.push(match);
				} else {
					// mem0 returned a memory not in our episode list
					// (could be from a previous session). Create a synthetic episode.
					matchedEpisodes.push({
						id: r.id ?? randomUUID(),
						content: memoryText,
						summary: memoryText.slice(0, 200),
						timestamp: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
						importance: { importance: 0.5, surprise: 0, emotion: 0.5, utility: 0.5 },
						encodingContext: { project: r.metadata?.project },
						consolidated: true,
						recallCount: 1,
						lastAccessed: Date.now(),
						strength: 0.5,
					});
				}
			}

			// Apply context boost if project matches
			if (context.project) {
				matchedEpisodes.sort((a, b) => {
					const aBoost = a.encodingContext.project === context.project ? 1 : 0;
					const bBoost = b.encodingContext.project === context.project ? 1 : 0;
					return bBoost - aBoost;
				});
			}

			return matchedEpisodes.slice(0, topK);
		},

		getRecent: async (n: number): Promise<Episode[]> => {
			return [...this.episodes]
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, n);
		},

		getUnconsolidated: async (): Promise<Episode[]> => {
			return this.episodes.filter((ep) => !ep.consolidated);
		},

		markConsolidated: async (ids: string[]): Promise<void> => {
			const idSet = new Set(ids);
			for (const ep of this.episodes) {
				if (idSet.has(ep.id)) ep.consolidated = true;
			}
		},
	};

	// ─── Semantic Memory ─────────────────────────────────────────────────

	semantic = {
		upsert: async (fact: Fact): Promise<void> => {
			// Store/update in mem0
			const m = await this.ensureMem0();
			await m.add(
				[{ role: "user", content: fact.content }],
				{
					userId: this.userId,
					metadata: {
						type: "fact",
						factId: fact.id,
						entities: fact.entities,
						topics: fact.topics,
					},
				},
			);
		},

		search: async (query: string, topK: number): Promise<Fact[]> => {
			const m = await this.ensureMem0();
			const results = await m.search(query, {
				userId: this.userId,
				limit: topK,
			});

			const resultItems = results?.results ?? results ?? [];
			return resultItems.map((r: any) => ({
				id: r.id ?? randomUUID(),
				content: r.memory ?? r.text ?? r.content ?? "",
				entities: r.metadata?.entities ?? [],
				topics: r.metadata?.topics ?? [],
				createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
				updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
				importance: 0.5,
				recallCount: 1,
				lastAccessed: Date.now(),
				strength: 0.5,
				sourceEpisodes: [],
			}));
		},

		decay: async (now: number): Promise<number> => {
			// Apply Ebbinghaus decay to episodes
			let pruned = 0;
			this.episodes = this.episodes.filter((ep) => {
				const strength = calculateStrength(
					ep.importance.utility,
					ep.timestamp,
					ep.recallCount,
					ep.lastAccessed,
					now,
				);
				ep.strength = strength;
				if (shouldPrune(strength) && ep.consolidated) {
					pruned++;
					return false;
				}
				return true;
			});
			return pruned;
		},

		associate: async (entityA: string, entityB: string, weight?: number): Promise<void> => {
			this.kg.strengthen(entityA, entityB, weight);
		},

		getAll: async (): Promise<Fact[]> => {
			const m = await this.ensureMem0();
			const results = await m.getAll({ userId: this.userId });
			const resultItems = results?.results ?? results ?? [];
			return resultItems.map((r: any) => ({
				id: r.id ?? randomUUID(),
				content: r.memory ?? r.text ?? r.content ?? "",
				entities: r.metadata?.entities ?? [],
				topics: r.metadata?.topics ?? [],
				createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
				updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
				importance: 0.5,
				recallCount: 0,
				lastAccessed: Date.now(),
				strength: 0.5,
				sourceEpisodes: [],
			}));
		},
	};

	// ─── Procedural Memory ───────────────────────────────────────────────

	procedural = {
		getSkill: async (name: string): Promise<Skill | null> => {
			return this.skills.find((s) => s.name === name) ?? null;
		},

		recordOutcome: async (name: string, success: boolean): Promise<void> => {
			let skill = this.skills.find((s) => s.name === name);
			if (!skill) {
				skill = {
					id: randomUUID(),
					name,
					description: "",
					learnedAt: Date.now(),
					successCount: 0,
					failureCount: 0,
					confidence: 0,
				};
				this.skills.push(skill);
			}
			if (success) skill.successCount++;
			else skill.failureCount++;
			skill.confidence = skill.successCount / (skill.successCount + skill.failureCount);
		},

		learnFromFailure: async (reflection: Reflection): Promise<void> => {
			this.reflections.push(reflection);

			// Also store in mem0 for semantic retrieval
			const m = await this.ensureMem0();
			await m.add(
				[{ role: "user", content: `Task: ${reflection.task}. Failure: ${reflection.failure}. Correction: ${reflection.correction}` }],
				{
					userId: this.userId,
					metadata: { type: "reflection" },
				},
			);
		},

		getReflections: async (task: string, topK: number): Promise<Reflection[]> => {
			// Use mem0 semantic search for reflections
			const m = await this.ensureMem0();
			const results = await m.search(`task failure: ${task}`, {
				userId: this.userId,
				limit: topK,
			});

			// Also search local reflections by keyword
			const taskLower = task.toLowerCase();
			const localMatches = this.reflections
				.filter((r) => r.task.toLowerCase().includes(taskLower) ||
					taskLower.includes(r.task.toLowerCase()))
				.slice(0, topK);

			return localMatches;
		},
	};

	// ─── Consolidation ───────────────────────────────────────────────────

	async consolidate(): Promise<ConsolidationResult> {
		const now = Date.now();

		// 1. Decay sweep
		const memoriesPruned = await this.semantic.decay(now);

		// 2. Knowledge graph edge decay
		const associationsUpdated = this.kg.decayEdges(0.95, 0.01);

		return {
			episodesProcessed: 0,
			factsCreated: 0,
			factsUpdated: 0,
			memoriesPruned,
			associationsUpdated,
		};
	}

	async close(): Promise<void> {
		// mem0 OSS doesn't require explicit close
	}
}
