/**
 * Tests for memory system improvements (Round 1):
 * - Long-term retention at various ages
 * - Fact merging / consolidation compression
 * - Decay parameter boundary conditions
 * - Korean NLP edge cases
 * - Scaling with many facts
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calculateStrength, shouldPrune, BASE_DECAY, IMPORTANCE_DAMPING, PRUNE_THRESHOLD } from "../decay.js";
import { LocalAdapter } from "../local-adapter.js";
import { MemorySystem } from "../index.js";
import type { Episode, Fact, ImportanceScore } from "../types.js";

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

function makeFact(content: string, entities: string[], overrides?: Partial<Fact>): Fact {
	const now = Date.now();
	return {
		id: randomUUID(),
		content,
		entities,
		topics: [],
		createdAt: now,
		updatedAt: now,
		importance: 0.5,
		recallCount: 0,
		lastAccessed: now,
		strength: 0.5,
		sourceEpisodes: [],
		...overrides,
	};
}

function makeEpisode(content: string, overrides?: Partial<Episode>): Episode {
	const now = Date.now();
	return {
		id: randomUUID(),
		content,
		summary: content.slice(0, 200),
		timestamp: now,
		importance: { importance: 0.5, surprise: 0.1, emotion: 0.3, utility: 0.4 },
		encodingContext: { project: "test-project", activeFile: "" },
		consolidated: false,
		recallCount: 0,
		lastAccessed: now,
		strength: 0.4,
		...overrides,
	};
}

// ─── Long-Term Retention Tests ───────────────────────────────────────────────

describe("Long-term memory retention", () => {
	it.each([
		{ importance: 0.9, days: 30, shouldSurvive: true, label: "very high importance survives 30 days" },
		{ importance: 0.9, days: 60, shouldSurvive: true, label: "very high importance survives 60 days" },
		{ importance: 0.9, days: 120, shouldSurvive: true, label: "very high importance survives 120 days" },
		{ importance: 0.9, days: 150, shouldSurvive: true, label: "very high importance survives ~5 months" },
		{ importance: 0.9, days: 180, shouldSurvive: false, label: "very high importance fades by 6 months without recall" },
		{ importance: 0.7, days: 30, shouldSurvive: true, label: "high importance survives 30 days" },
		{ importance: 0.7, days: 60, shouldSurvive: true, label: "high importance survives 60 days" },
		{ importance: 0.7, days: 80, shouldSurvive: true, label: "high importance survives ~80 days" },
		{ importance: 0.5, days: 30, shouldSurvive: true, label: "medium importance survives 30 days" },
		{ importance: 0.5, days: 60, shouldSurvive: false, label: "medium importance fades by 60 days" },
		{ importance: 0.15, days: 14, shouldSurvive: true, label: "low importance survives 2 weeks" },
		{ importance: 0.15, days: 30, shouldSurvive: false, label: "low importance fades by 30 days" },
		{ importance: 0.05, days: 7, shouldSurvive: false, label: "trivial importance fades within 1 week" },
	])("$label", ({ importance, days, shouldSurvive }) => {
		const now = Date.now();
		const old = now - days * DAY;
		const strength = calculateStrength(importance, old, 0, old, now);
		if (shouldSurvive) {
			expect(shouldPrune(strength)).toBe(false);
		} else {
			expect(shouldPrune(strength)).toBe(true);
		}
	});

	it("recall extends memory lifetime", () => {
		const now = Date.now();
		const old = now - 90 * DAY;
		// Without recall: importance 0.5 at 90 days should be pruned
		const withoutRecall = calculateStrength(0.5, old, 0, old, now);
		expect(shouldPrune(withoutRecall)).toBe(true);
		// With 3 recalls and recent access (30 days ago): should survive
		const recentAccess = now - 30 * DAY;
		const withRecall = calculateStrength(0.5, old, 3, recentAccess, now);
		expect(shouldPrune(withRecall)).toBe(false);
	});

	it("user's name (importance 0.9) survives 4 months without recall", () => {
		const now = Date.now();
		const fourMonths = now - 120 * DAY;
		const strength = calculateStrength(0.9, fourMonths, 0, fourMonths, now);
		expect(shouldPrune(strength)).toBe(false);
	});

	it("user's name with regular recall survives indefinitely", () => {
		const now = Date.now();
		// Recalled once a month for 6 months → lastAccessed = 30 days ago
		const recentAccess = now - 30 * DAY;
		const strength = calculateStrength(0.9, now - 180 * DAY, 6, recentAccess, now);
		expect(shouldPrune(strength)).toBe(false);
		// Should be quite strong with 6 recalls
		expect(strength).toBeGreaterThan(0.5);
	});
});

// ─── Decay Parameter Tests ──────────────────────────────────────────────────

describe("Decay parameter correctness", () => {
	it("BASE_DECAY is calibrated for personal AI (< 0.12)", () => {
		expect(BASE_DECAY).toBeLessThan(0.12);
		expect(BASE_DECAY).toBeGreaterThan(0.02);
	});

	it("IMPORTANCE_DAMPING provides strong protection for high-importance (≥ 0.8)", () => {
		expect(IMPORTANCE_DAMPING).toBeGreaterThanOrEqual(0.8);
		expect(IMPORTANCE_DAMPING).toBeLessThanOrEqual(0.95);
	});

	it("effective decay rate for max importance is ≤ 25% of base", () => {
		const maxImportance = 1.0;
		const effectiveLambda = BASE_DECAY * (1 - maxImportance * IMPORTANCE_DAMPING);
		expect(effectiveLambda / BASE_DECAY).toBeLessThanOrEqual(0.25);
	});

	it("effective decay rate for zero importance equals base rate", () => {
		const effectiveLambda = BASE_DECAY * (1 - 0 * IMPORTANCE_DAMPING);
		expect(effectiveLambda).toBe(BASE_DECAY);
	});

	it("PRUNE_THRESHOLD allows gradual fade, not hard cutoff", () => {
		expect(PRUNE_THRESHOLD).toBeGreaterThanOrEqual(0.01);
		expect(PRUNE_THRESHOLD).toBeLessThanOrEqual(0.1);
	});
});

// ─── Consolidation Compression Tests ────────────────────────────────────────

describe("Consolidation compression (fact merging)", () => {
	it("merges episodes from same project within time window", async () => {
		const storePath = join(tmpdir(), `merge-test-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);
		const system = new MemorySystem({ adapter });
		const now = Date.now();
		const recent = now - 2 * HOUR;

		const episodes = [
			"We decided to use TypeScript for all modules",
			"Team chose Vitest over Jest for testing",
			"We prefer ESLint with strict rules",
		];

		for (const content of episodes) {
			await adapter.episode.store(
				makeEpisode(content, {
					timestamp: recent,
					lastAccessed: recent,
					importance: { importance: 0.6, surprise: 0.1, emotion: 0.5, utility: 0.5 },
				}),
			);
		}

		const result = await system.consolidateNow();
		// With temporal grouping, episodes from same project + time should merge
		expect(result.factsCreated).toBeLessThan(episodes.length);
		expect(result.episodesProcessed).toBe(episodes.length);

		await system.close();
	});

	it("does NOT merge episodes from different projects", async () => {
		const storePath = join(tmpdir(), `no-merge-test-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);
		const system = new MemorySystem({ adapter });
		const now = Date.now();
		const recent = now - 2 * HOUR;

		// Different projects
		await adapter.episode.store(
			makeEpisode("We decided to use TypeScript", {
				timestamp: recent,
				lastAccessed: recent,
				importance: { importance: 0.6, surprise: 0.1, emotion: 0.5, utility: 0.5 },
				encodingContext: { project: "project-alpha", activeFile: "" },
			}),
		);
		await adapter.episode.store(
			makeEpisode("Team chose Python for backend", {
				timestamp: recent,
				lastAccessed: recent,
				importance: { importance: 0.6, surprise: 0.1, emotion: 0.5, utility: 0.5 },
				encodingContext: { project: "project-beta", activeFile: "" },
			}),
		);

		const result = await system.consolidateNow();
		// Different projects should NOT merge
		expect(result.factsCreated).toBe(2);

		await system.close();
	});

	it("does NOT merge episodes far apart in time", async () => {
		const storePath = join(tmpdir(), `time-gap-test-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);
		const system = new MemorySystem({ adapter });
		const now = Date.now();

		await adapter.episode.store(
			makeEpisode("We decided to use TypeScript", {
				timestamp: now - 5 * HOUR, // 5 hours ago
				lastAccessed: now - 5 * HOUR,
				importance: { importance: 0.6, surprise: 0.1, emotion: 0.5, utility: 0.5 },
			}),
		);
		await adapter.episode.store(
			makeEpisode("Team chose React for frontend", {
				timestamp: now - 2 * HOUR, // 2 hours ago (3 hour gap)
				lastAccessed: now - 2 * HOUR,
				importance: { importance: 0.6, surprise: 0.1, emotion: 0.5, utility: 0.5 },
			}),
		);

		const result = await system.consolidateNow();
		// 3-hour gap exceeds 30-minute window — should produce separate facts
		expect(result.factsCreated).toBe(2);

		await system.close();
	});
});

// ─── Korean NLP Edge Cases ──────────────────────────────────────────────────

describe("Korean language handling", () => {
	it("finds keywords with Korean particles attached", async () => {
		const storePath = join(tmpdir(), `korean-test-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);

		await adapter.semantic.upsert(
			makeFact("TypeScript로 개발하고 있어", ["TypeScript"]),
		);
		await adapter.semantic.upsert(
			makeFact("Neovim을 사용해", ["Neovim"]),
		);

		// Query without particles
		const results = await adapter.semantic.search("TypeScript", 5);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].content).toContain("TypeScript");

		await adapter.close();
	});

	it("finds Korean-only facts by keyword", async () => {
		const storePath = join(tmpdir(), `korean-search-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);

		await adapter.semantic.upsert(
			makeFact("아메리카노만 마시고 우유 들어간 건 싫어해", ["아메리카노"]),
		);

		const results = await adapter.semantic.search("커피 뭐 좋아해", 5);
		// "아메리카노" is not "커피" — keyword search won't find this
		// But if we search for the actual keyword:
		const directResults = await adapter.semantic.search("아메리카노", 5);
		expect(directResults.length).toBeGreaterThanOrEqual(1);

		await adapter.close();
	});

	it("handles Korean contradiction detection keywords", async () => {
		const storePath = join(tmpdir(), `korean-contradiction-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);
		const system = new MemorySystem({ adapter });

		// Store original fact
		await adapter.semantic.upsert(
			makeFact("에디터는 Neovim 쓰고 있어", ["Neovim"]),
		);

		// Encode contradiction with Korean markers
		await system.encode(
			{ content: "아 참, 에디터 Cursor로 바꿨어", role: "user" },
			{ project: "test", activeFile: "" },
		);

		const facts = await adapter.semantic.getAll();
		// Should have detected contradiction and updated
		const cursorFact = facts.find((f) => f.content.includes("Cursor"));
		expect(cursorFact).toBeTruthy();

		await system.close();
	});
});

// ─── Scaling Tests ──────────────────────────────────────────────────────────

describe("Scaling with many facts", () => {
	it("handles 100 facts without performance degradation", async () => {
		const storePath = join(tmpdir(), `scale-100-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);

		// Insert 100 facts
		for (let i = 0; i < 100; i++) {
			await adapter.semantic.upsert(
				makeFact(
					`Fact number ${i}: The user prefers configuration ${i}`,
					[`entity-${i}`, `category-${Math.floor(i / 10)}`],
					{ importance: 0.3 + Math.random() * 0.7 },
				),
			);
		}

		const allFacts = await adapter.semantic.getAll();
		expect(allFacts.length).toBe(100);

		// Search should still work
		const start = performance.now();
		const results = await adapter.semantic.search("configuration 50", 5);
		const elapsed = performance.now() - start;

		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(elapsed).toBeLessThan(100); // Should complete in < 100ms

		await adapter.close();
	});

	it("decay sweep handles 100 facts correctly", async () => {
		const storePath = join(tmpdir(), `scale-decay-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);
		const now = Date.now();

		// 50 old low-importance + 50 recent high-importance
		for (let i = 0; i < 50; i++) {
			await adapter.semantic.upsert(
				makeFact(`Old fact ${i}`, [`old-${i}`], {
					importance: 0.1,
					createdAt: now - 90 * DAY,
					lastAccessed: now - 90 * DAY,
				}),
			);
		}
		for (let i = 0; i < 50; i++) {
			await adapter.semantic.upsert(
				makeFact(`Recent fact ${i}`, [`recent-${i}`], {
					importance: 0.8,
					createdAt: now - DAY,
					lastAccessed: now - DAY,
				}),
			);
		}

		const pruned = await adapter.semantic.decay(now);
		expect(pruned).toBe(50); // All old low-importance pruned
		const remaining = await adapter.semantic.getAll();
		expect(remaining.length).toBe(50); // All recent high-importance survive

		await adapter.close();
	});
});

// ─── Importance Retention Detailed Tests ────────────────────────────────────

describe("Importance-based retention discrimination", () => {
	it("clearly separates high vs low importance survival at 60 days", async () => {
		const storePath = join(tmpdir(), `retention-${randomUUID()}.json`);
		const adapter = new LocalAdapter(storePath);
		const now = Date.now();
		const sixtyDaysAgo = now - 60 * DAY;

		const importanceLevels = [0.9, 0.8, 0.7, 0.5, 0.3, 0.15, 0.1, 0.05];
		for (const imp of importanceLevels) {
			await adapter.semantic.upsert(
				makeFact(`Fact importance ${imp}`, [`level-${imp}`], {
					importance: imp,
					createdAt: sixtyDaysAgo,
					lastAccessed: sixtyDaysAgo,
				}),
			);
		}

		await adapter.semantic.decay(now);
		const surviving = await adapter.semantic.getAll();
		const survivingImportances = surviving.map((f) => f.importance).sort((a, b) => b - a);

		// High importance (0.7+) should survive, low (0.3-) should be pruned
		expect(survivingImportances.every((imp) => imp >= 0.5)).toBe(true);
		// At least the top 3 should survive
		expect(surviving.length).toBeGreaterThanOrEqual(3);

		await adapter.close();
	});
});
