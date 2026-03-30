import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalAdapter } from "../adapters/local.js";
import type { Episode, Fact, ImportanceScore } from "../types.js";

const DAY = 1000 * 60 * 60 * 24;

function testStorePath(): string {
	return join(tmpdir(), `naia-memory-test-${randomUUID()}.json`);
}

function makeImportance(utility = 0.5): ImportanceScore {
	return { importance: utility, surprise: 0.1, emotion: 0.5, utility };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
	const now = Date.now();
	return {
		id: randomUUID(),
		content: "Test episode content",
		summary: "Test summary",
		timestamp: now,
		importance: makeImportance(0.5),
		encodingContext: { project: "naia-os" },
		consolidated: false,
		recallCount: 0,
		lastAccessed: now,
		strength: 0.5,
		...overrides,
	};
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
	const now = Date.now();
	return {
		id: randomUUID(),
		content: "User prefers TypeScript",
		entities: ["TypeScript"],
		topics: ["preferences"],
		createdAt: now,
		updatedAt: now,
		importance: 0.7,
		recallCount: 0,
		lastAccessed: now,
		strength: 0.7,
		sourceEpisodes: [],
		...overrides,
	};
}

describe("LocalAdapter", () => {
	let adapter: LocalAdapter;
	let storePath: string;

	beforeEach(() => {
		storePath = testStorePath();
		adapter = new LocalAdapter(storePath);
	});

	afterEach(async () => {
		await adapter.close();
		if (existsSync(storePath)) rmSync(storePath);
		const tmpPath = `${storePath}.tmp`;
		if (existsSync(tmpPath)) rmSync(tmpPath);
	});

	// ─── Episodic Memory ────────────────────────────────────────────────

	describe("episode", () => {
		it("stores and retrieves episodes", async () => {
			const ep = makeEpisode({ content: "Deployed React app to production" });
			await adapter.episode.store(ep);

			const recent = await adapter.episode.getRecent(10);
			expect(recent).toHaveLength(1);
			expect(recent[0].content).toBe("Deployed React app to production");
		});

		it("recalls episodes by keyword match", async () => {
			await adapter.episode.store(
				makeEpisode({ content: "Fixed React rendering bug" }),
			);
			await adapter.episode.store(
				makeEpisode({ content: "Updated Python dependencies" }),
			);

			const results = await adapter.episode.recall("React bug", { topK: 5 });
			expect(results).toHaveLength(1);
			expect(results[0].content).toContain("React");
		});

		it("boosts recall for matching project context (encoding specificity)", async () => {
			await adapter.episode.store(
				makeEpisode({
					content: "Fixed memory leak",
					encodingContext: { project: "naia-os" },
				}),
			);
			await adapter.episode.store(
				makeEpisode({
					content: "Fixed memory leak",
					encodingContext: { project: "other-project" },
				}),
			);

			const results = await adapter.episode.recall("memory leak", {
				project: "naia-os",
				topK: 5,
			});
			// Both match keyword, but naia-os one should rank higher
			expect(results[0].encodingContext.project).toBe("naia-os");
		});

		it("increments recall count on retrieval (reconsolidation)", async () => {
			const ep = makeEpisode({ content: "Important architecture decision" });
			await adapter.episode.store(ep);

			await adapter.episode.recall("architecture", { topK: 5 });
			const recent = await adapter.episode.getRecent(1);
			expect(recent[0].recallCount).toBe(1);

			await adapter.episode.recall("architecture", { topK: 5 });
			const recent2 = await adapter.episode.getRecent(1);
			expect(recent2[0].recallCount).toBe(2);
		});

		it("returns recent episodes in reverse chronological order", async () => {
			const now = Date.now();
			await adapter.episode.store(makeEpisode({ timestamp: now - 1000 }));
			await adapter.episode.store(makeEpisode({ timestamp: now }));
			await adapter.episode.store(makeEpisode({ timestamp: now - 2000 }));

			const recent = await adapter.episode.getRecent(3);
			expect(recent[0].timestamp).toBe(now);
			expect(recent[2].timestamp).toBe(now - 2000);
		});

		it("tracks unconsolidated episodes", async () => {
			await adapter.episode.store(makeEpisode({ consolidated: false }));
			await adapter.episode.store(makeEpisode({ consolidated: true }));
			await adapter.episode.store(makeEpisode({ consolidated: false }));

			const uncons = await adapter.episode.getUnconsolidated();
			expect(uncons).toHaveLength(2);
		});

		it("marks episodes as consolidated", async () => {
			const ep1 = makeEpisode({ consolidated: false });
			const ep2 = makeEpisode({ consolidated: false });
			await adapter.episode.store(ep1);
			await adapter.episode.store(ep2);

			await adapter.episode.markConsolidated([ep1.id]);

			const uncons = await adapter.episode.getUnconsolidated();
			expect(uncons).toHaveLength(1);
			expect(uncons[0].id).toBe(ep2.id);
		});
	});

	// ─── Semantic Memory ────────────────────────────────────────────────

	describe("semantic", () => {
		it("upserts new facts", async () => {
			const fact = makeFact({ content: "User likes dark mode" });
			await adapter.semantic.upsert(fact);

			const all = await adapter.semantic.getAll();
			expect(all).toHaveLength(1);
			expect(all[0].content).toBe("User likes dark mode");
		});

		it("reconsolidates existing facts on upsert (same id)", async () => {
			const id = randomUUID();
			const fact1 = makeFact({
				id,
				content: "User likes vim",
				entities: ["vim"],
			});
			await adapter.semantic.upsert(fact1);

			const fact2 = makeFact({
				id,
				content: "User switched to neovim",
				entities: ["neovim"],
				importance: 0.9,
			});
			await adapter.semantic.upsert(fact2);

			const all = await adapter.semantic.getAll();
			expect(all).toHaveLength(1);
			expect(all[0].content).toBe("User switched to neovim");
			// Entities merged
			expect(all[0].entities).toContain("vim");
			expect(all[0].entities).toContain("neovim");
			// Importance takes max
			expect(all[0].importance).toBe(0.9);
		});

		it("searches facts by keyword", async () => {
			await adapter.semantic.upsert(
				makeFact({
					content: "User prefers TypeScript",
					entities: ["TypeScript"],
				}),
			);
			await adapter.semantic.upsert(
				makeFact({
					content: "Meeting scheduled for Friday",
					entities: ["calendar"],
				}),
			);

			const results = await adapter.semantic.search("TypeScript", 5);
			expect(results).toHaveLength(1);
			expect(results[0].content).toContain("TypeScript");
		});

		it("searches by entity match", async () => {
			await adapter.semantic.upsert(
				makeFact({
					content: "Primary language for the project",
					entities: ["TypeScript", "React"],
				}),
			);

			const results = await adapter.semantic.search("typescript", 5);
			expect(results.length).toBeGreaterThan(0);
		});

		it("increments recall count on search (reconsolidation)", async () => {
			await adapter.semantic.upsert(makeFact({ content: "User prefers tabs" }));

			await adapter.semantic.search("tabs", 5);
			const all = await adapter.semantic.getAll();
			expect(all[0].recallCount).toBe(1);
		});

		it("runs Ebbinghaus decay sweep", async () => {
			const now = Date.now();
			// Old, low-importance fact
			await adapter.semantic.upsert(
				makeFact({
					content: "Trivial fact",
					importance: 0.05,
					createdAt: now - 90 * DAY,
					lastAccessed: now - 90 * DAY,
				}),
			);
			// Recent, high-importance fact
			await adapter.semantic.upsert(
				makeFact({
					content: "Critical decision",
					importance: 0.9,
					createdAt: now,
					lastAccessed: now,
				}),
			);

			const pruned = await adapter.semantic.decay(now);
			expect(pruned).toBeGreaterThanOrEqual(1);

			const remaining = await adapter.semantic.getAll();
			expect(remaining).toHaveLength(1);
			expect(remaining[0].content).toBe("Critical decision");
		});

		it("manages Hebbian associations", async () => {
			await adapter.semantic.associate("React", "TypeScript");
			await adapter.semantic.associate("React", "TypeScript"); // Strengthen

			const store = adapter.getStore();
			const key = "react::typescript";
			expect(store.associations[key]).toBeGreaterThan(0.1);
		});
	});

	// ─── Procedural Memory ──────────────────────────────────────────────

	describe("procedural", () => {
		it("records skill outcomes", async () => {
			await adapter.procedural.recordOutcome("git-rebase", true);
			await adapter.procedural.recordOutcome("git-rebase", true);
			await adapter.procedural.recordOutcome("git-rebase", false);

			const skill = await adapter.procedural.getSkill("git-rebase");
			expect(skill).not.toBeNull();
			expect(skill?.successCount).toBe(2);
			expect(skill?.failureCount).toBe(1);
			expect(skill?.confidence).toBeCloseTo(2 / 3);
		});

		it("stores and retrieves reflections", async () => {
			await adapter.procedural.learnFromFailure({
				task: "Deploy to production",
				failure: "Missing environment variable",
				analysis: "Didn't check .env.example before deploying",
				correction: "Always validate env vars before deploy",
				timestamp: Date.now(),
			});

			const results = await adapter.procedural.getReflections(
				"deploy production",
				5,
			);
			expect(results).toHaveLength(1);
			expect(results[0].correction).toContain("validate env vars");
		});

		it("returns empty for unrelated reflection queries", async () => {
			await adapter.procedural.learnFromFailure({
				task: "Deploy to production",
				failure: "Missing env var",
				analysis: "Didn't check",
				correction: "Always check",
				timestamp: Date.now(),
			});

			const results = await adapter.procedural.getReflections(
				"cooking recipe",
				5,
			);
			expect(results).toHaveLength(0);
		});
	});

	// ─── Consolidation ──────────────────────────────────────────────────

	describe("consolidation", () => {
		it("runs without errors", async () => {
			await adapter.episode.store(makeEpisode());
			const result = await adapter.consolidate();
			expect(result).toHaveProperty("episodesProcessed");
			expect(result).toHaveProperty("memoriesPruned");
		});

		it("decays associations during consolidation", async () => {
			await adapter.semantic.associate("React", "Vue");
			const before = adapter.getStore().associations["react::vue"];

			await adapter.consolidate();
			const after = adapter.getStore().associations["react::vue"];

			expect(after).toBeLessThan(before!);
		});
	});

	// ─── Persistence ────────────────────────────────────────────────────

	describe("persistence", () => {
		it("persists data across adapter instances", async () => {
			await adapter.episode.store(
				makeEpisode({ content: "Persistent memory" }),
			);
			await adapter.semantic.upsert(makeFact({ content: "Persistent fact" }));
			await adapter.close();

			const adapter2 = new LocalAdapter(storePath);
			const episodes = await adapter2.episode.getRecent(10);
			const facts = await adapter2.semantic.getAll();

			expect(episodes).toHaveLength(1);
			expect(episodes[0].content).toBe("Persistent memory");
			expect(facts).toHaveLength(1);
			expect(facts[0].content).toBe("Persistent fact");

			await adapter2.close();
		});

		it("handles corrupted store file gracefully", async () => {
			const { writeFileSync } = await import("node:fs");
			writeFileSync(storePath, "not valid json{{{");

			const adapter2 = new LocalAdapter(storePath);
			const episodes = await adapter2.episode.getRecent(10);
			expect(episodes).toHaveLength(0); // Fresh start, no crash

			await adapter2.close();
		});
	});
});
