import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalAdapter } from "../adapters/local.js";
import { MemorySystem } from "../index.js";
import type { Fact } from "../types.js";

function testStorePath(): string {
	return join(tmpdir(), `naia-memsys-test-${randomUUID()}.json`);
}

const HOUR = 1000 * 60 * 60;

describe("MemorySystem", () => {
	let system: MemorySystem;
	let adapter: LocalAdapter;
	let storePath: string;

	beforeEach(() => {
		storePath = testStorePath();
		adapter = new LocalAdapter(storePath);
		system = new MemorySystem({ adapter });
	});

	afterEach(async () => {
		await system.close();
		try {
			rmSync(storePath);
		} catch {
			/* ignore */
		}
		try {
			rmSync(`${storePath}.tmp`);
		} catch {
			/* ignore */
		}
	});

	describe("encode (importance gating)", () => {
		it("stores high-importance user messages", async () => {
			const episode = await system.encode(
				{
					content: "I always want to use TypeScript, never JavaScript",
					role: "user",
				},
				{ project: "naia-os" },
			);
			expect(episode).not.toBeNull();
			expect(episode?.importance.utility).toBeGreaterThan(0);
		});

		it("gates out trivial tool outputs", async () => {
			const episode = await system.encode(
				{ content: "ok", role: "tool" },
				{ project: "naia-os" },
			);
			expect(episode).toBeNull();
		});

		it("encodes context for later retrieval specificity", async () => {
			const episode = await system.encode(
				{
					content: "This is an important decision about architecture",
					role: "user",
				},
				{ project: "naia-os", activeFile: "src/index.ts" },
			);
			expect(episode).not.toBeNull();
			expect(episode?.encodingContext.project).toBe("naia-os");
			expect(episode?.encodingContext.activeFile).toBe("src/index.ts");
		});
	});

	describe("encode + reconsolidation", () => {
		it("updates contradicted facts when new info is encoded", async () => {
			// Seed an existing fact
			const now = Date.now();
			const fact: Fact = {
				id: randomUUID(),
				content: "User prefers vim",
				entities: ["vim"],
				topics: ["preferences"],
				createdAt: now,
				updatedAt: now,
				importance: 0.6,
				recallCount: 0,
				lastAccessed: now,
				strength: 0.6,
				sourceEpisodes: [],
			};
			await adapter.semantic.upsert(fact);

			// Encode a message that contradicts the fact
			await system.encode(
				{
					content: "I no longer use vim, I switched to neovim instead",
					role: "user",
				},
				{ project: "naia-os" },
			);

			// The fact should have been reconsolidated
			const facts = await adapter.semantic.getAll();
			const vimFact = facts.find((f) => f.id === fact.id);
			expect(vimFact).toBeDefined();
			expect(vimFact?.content).toContain("neovim");
		});
	});

	describe("recall", () => {
		it("retrieves encoded memories", async () => {
			await system.encode(
				{ content: "We decided to use Vitest for all testing", role: "user" },
				{ project: "naia-os" },
			);

			const result = await system.recall("testing framework", { topK: 3 });
			expect(result.episodes.length).toBeGreaterThan(0);
		});

		it("returns empty for unrelated queries", async () => {
			await system.encode(
				{ content: "Deploy the React app", role: "user" },
				{ project: "naia-os" },
			);

			const result = await system.recall("cooking recipes", { topK: 3 });
			expect(result.episodes).toHaveLength(0);
		});
	});

	describe("sessionRecall", () => {
		it("returns empty string when no relevant memories exist", async () => {
			const context = await system.sessionRecall("Hello", { topK: 3 });
			expect(context).toBe("");
		});

		it("returns formatted context when facts exist", async () => {
			const now = Date.now();
			await adapter.semantic.upsert({
				id: randomUUID(),
				content: "User prefers dark mode",
				entities: ["dark mode"],
				topics: ["preferences"],
				createdAt: now,
				updatedAt: now,
				importance: 0.7,
				recallCount: 0,
				lastAccessed: now,
				strength: 0.7,
				sourceEpisodes: [],
			});

			const context = await system.sessionRecall(
				"What are the user settings?",
				{ topK: 3 },
			);
			// "dark" and "mode" are both keywords, query "settings" won't match.
			// Need query with overlapping keywords
			const context2 = await system.sessionRecall("dark mode preference", {
				topK: 3,
			});
			expect(context2).toContain("관련 기억");
			expect(context2).toContain("dark mode");
		});
	});

	describe("reflectOnFailure (Reflexion pattern)", () => {
		it("stores and recalls reflections", async () => {
			await system.reflectOnFailure(
				"Database migration",
				"Migration failed on production",
				"Didn't test with production data volume",
				"Always run migration against a production-sized dataset first",
			);

			const result = await system.recall("database migration", { topK: 3 });
			expect(result.reflections).toHaveLength(1);
			expect(result.reflections[0].correction).toContain(
				"production-sized dataset",
			);
		});

		it("recalls past reflections for similar tasks", async () => {
			await system.reflectOnFailure(
				"Deploy to staging",
				"Forgot to set env vars",
				"No pre-deploy checklist",
				"Create a deployment checklist with env var validation",
			);
			await system.reflectOnFailure(
				"Unit test setup",
				"Tests flaky due to shared state",
				"No test isolation",
				"Use fresh fixtures per test, never share mutable state",
			);

			const deployResult = await system.recall("deploy staging environment", {
				topK: 3,
			});
			expect(deployResult.reflections.length).toBeGreaterThan(0);
			expect(deployResult.reflections[0].task).toContain("Deploy");
		});
	});

	describe("consolidation pipeline", () => {
		it("extracts facts from old unconsolidated episodes", async () => {
			// Store an episode with a decision keyword, backdated > 1 hour
			const ep = {
				id: randomUUID(),
				content: "We decided to use TypeScript for all new code",
				summary: "Decided TypeScript",
				timestamp: Date.now() - 2 * HOUR,
				importance: {
					importance: 0.6,
					surprise: 0.1,
					emotion: 0.5,
					utility: 0.5,
				},
				encodingContext: { project: "naia-os" },
				consolidated: false,
				recallCount: 0,
				lastAccessed: Date.now() - 2 * HOUR,
				strength: 0.5,
			};
			await adapter.episode.store(ep);

			const result = await system.consolidateNow();
			expect(result.episodesProcessed).toBe(1);
			expect(result.factsCreated).toBeGreaterThanOrEqual(1);

			// Episode should now be marked consolidated
			const uncons = await adapter.episode.getUnconsolidated();
			expect(uncons).toHaveLength(0);

			// A fact should have been created
			const facts = await adapter.semantic.getAll();
			expect(facts.length).toBeGreaterThan(0);
			expect(facts.some((f) => f.content.includes("TypeScript"))).toBe(true);
		});

		it("skips episodes less than 1 hour old", async () => {
			await system.encode(
				{ content: "We decided to use Rust for the backend", role: "user" },
				{ project: "naia-os" },
			);

			const result = await system.consolidateNow();
			expect(result.episodesProcessed).toBe(0);
		});

		it("does not double-consolidate", async () => {
			const ep = {
				id: randomUUID(),
				content: "We always prefer Vitest over Jest",
				summary: "Prefer Vitest",
				timestamp: Date.now() - 2 * HOUR,
				importance: {
					importance: 0.6,
					surprise: 0.1,
					emotion: 0.5,
					utility: 0.5,
				},
				encodingContext: { project: "naia-os" },
				consolidated: false,
				recallCount: 0,
				lastAccessed: Date.now() - 2 * HOUR,
				strength: 0.5,
			};
			await adapter.episode.store(ep);

			await system.consolidateNow();
			const factsAfterFirst = (await adapter.semantic.getAll()).length;

			await system.consolidateNow();
			const factsAfterSecond = (await adapter.semantic.getAll()).length;

			// Second consolidation should not create duplicate facts
			expect(factsAfterSecond).toBe(factsAfterFirst);
		});

		it("prevents concurrent consolidation", async () => {
			const ep = {
				id: randomUUID(),
				content: "We must always use ESLint",
				summary: "Use ESLint",
				timestamp: Date.now() - 2 * HOUR,
				importance: {
					importance: 0.6,
					surprise: 0.1,
					emotion: 0.5,
					utility: 0.5,
				},
				encodingContext: { project: "naia-os" },
				consolidated: false,
				recallCount: 0,
				lastAccessed: Date.now() - 2 * HOUR,
				strength: 0.5,
			};
			await adapter.episode.store(ep);

			// Launch two consolidations simultaneously
			const [r1, r2] = await Promise.all([
				system.consolidateNow(),
				system.consolidateNow(),
			]);

			// One should process, the other should skip
			const totalProcessed = r1.episodesProcessed + r2.episodesProcessed;
			expect(totalProcessed).toBe(1);
		});

		it("supports custom fact extractor", async () => {
			const customAdapter = new LocalAdapter(testStorePath());
			const customSystem = new MemorySystem({
				adapter: customAdapter,
				factExtractor: async (episodes) => {
					return episodes.map((ep) => ({
						content: `CUSTOM: ${ep.content}`,
						entities: ["Custom"],
						topics: ["test"],
						importance: 0.8,
						sourceEpisodeIds: [ep.id],
					}));
				},
			});

			const ep = {
				id: randomUUID(),
				content: "Any content here",
				summary: "Any",
				timestamp: Date.now() - 2 * HOUR,
				importance: {
					importance: 0.5,
					surprise: 0.1,
					emotion: 0.5,
					utility: 0.5,
				},
				encodingContext: {},
				consolidated: false,
				recallCount: 0,
				lastAccessed: Date.now() - 2 * HOUR,
				strength: 0.5,
			};
			await customAdapter.episode.store(ep);

			const result = await customSystem.consolidateNow();
			expect(result.factsCreated).toBe(1);

			const facts = await customAdapter.semantic.getAll();
			expect(facts[0].content).toContain("CUSTOM:");

			await customSystem.close();
		});
	});

	describe("consolidation lifecycle", () => {
		it("starts and stops consolidation timer", () => {
			system.startConsolidation();
			// Starting again is a no-op
			system.startConsolidation();
			system.stopConsolidation();
			// Stopping again is safe
			system.stopConsolidation();
		});

		it("isConsolidating flag is false when idle", () => {
			expect(system.isConsolidating).toBe(false);
		});
	});
});
