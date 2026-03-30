import { randomUUID } from "node:crypto";
/**
 * Memory wiring integration test.
 *
 * Verifies that MemorySystem is properly connected to the agent's
 * conversation pipeline — encode on input, recall on session start.
 *
 * Does NOT require Gateway or LLM — tests the LocalAdapter path.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalAdapter } from "../adapters/local.js";
import { MemorySystem } from "../index.js";

const HOUR = 1000 * 60 * 60;

describe("Memory wiring integration", () => {
	let system: MemorySystem;
	let adapter: LocalAdapter;
	let storePath: string;

	beforeEach(() => {
		storePath = join(tmpdir(), `naia-wiring-test-${randomUUID()}.json`);
		adapter = new LocalAdapter(storePath);
		system = new MemorySystem({ adapter });
	});

	afterEach(async () => {
		await system.close();
		try {
			rmSync(storePath);
		} catch {}
		try {
			rmSync(`${storePath}.tmp`);
		} catch {}
	});

	describe("Session 1 → Session 2 simulation", () => {
		it("remembers facts from previous session", async () => {
			// === Session 1: User tells facts ===
			await system.encode(
				{
					content: "My name is Kim Haneul, startup CEO and fullstack developer",
					role: "user",
				},
				{ project: "naia-os" },
			);
			await system.encode(
				{ content: "I mainly develop with TypeScript", role: "user" },
				{ project: "naia-os" },
			);
			await system.encode(
				{ content: "My editor is Neovim", role: "user" },
				{ project: "naia-os" },
			);

			// === Simulate session restart (same adapter, new recall) ===
			const result1 = await system.recall("Haneul", { topK: 5 });
			expect(result1.episodes.length).toBeGreaterThan(0);

			const result2 = await system.recall("TypeScript", { topK: 5 });
			expect(result2.episodes.length).toBeGreaterThan(0);

			const result3 = await system.recall("Neovim", { topK: 5 });
			expect(result3.episodes.length).toBeGreaterThan(0);
		});

		it("sessionRecall returns formatted context for system prompt", async () => {
			// Store a fact with decision keyword (for consolidation)
			const now = Date.now();
			await adapter.semantic.upsert({
				id: randomUUID(),
				content: "사용자는 항상 TypeScript를 사용해야 한다고 결정",
				entities: ["TypeScript"],
				topics: ["preferences"],
				createdAt: now,
				updatedAt: now,
				importance: 0.7,
				recallCount: 0,
				lastAccessed: now,
				strength: 0.7,
				sourceEpisodes: [],
			});

			const context = await system.sessionRecall("TypeScript 프로젝트", {
				topK: 3,
			});
			expect(context).toContain("관련 기억");
			expect(context).toContain("TypeScript");
		});

		it("importance gating filters trivial inputs", async () => {
			const trivial = await system.encode(
				{ content: "ok", role: "tool" },
				{ project: "naia-os" },
			);
			expect(trivial).toBeNull(); // Should be gated out

			const important = await system.encode(
				{
					content: "이 프로젝트에서는 반드시 ESLint를 사용해야 합니다",
					role: "user",
				},
				{ project: "naia-os" },
			);
			expect(important).not.toBeNull(); // Should be stored
		});

		it("persists across adapter instances (simulating app restart)", async () => {
			// Session 1: Store
			await system.encode(
				{ content: "나는 Fedora 쓰고 있어", role: "user" },
				{ project: "naia-os" },
			);
			await system.close();

			// Session 2: New adapter instance, same file
			const adapter2 = new LocalAdapter(storePath);
			const system2 = new MemorySystem({ adapter: adapter2 });

			const result = await system2.recall("Fedora", { topK: 5 });
			expect(result.episodes.length).toBeGreaterThan(0);
			expect(result.episodes[0].content).toContain("Fedora");

			await system2.close();
		});

		it("reconsolidation updates contradicted facts", async () => {
			const now = Date.now();
			// Store initial fact
			await adapter.semantic.upsert({
				id: randomUUID(),
				content: "User prefers Neovim",
				entities: ["Neovim"],
				topics: ["editor"],
				createdAt: now,
				updatedAt: now,
				importance: 0.6,
				recallCount: 0,
				lastAccessed: now,
				strength: 0.6,
				sourceEpisodes: [],
			});

			// Encode contradicting info
			await system.encode(
				{ content: "I no longer use Neovim, switched to Cursor", role: "user" },
				{ project: "naia-os" },
			);

			// Check the fact was reconsolidated
			const facts = await adapter.semantic.getAll();
			const editorFact = facts.find((f) => f.entities.includes("Neovim"));
			if (editorFact) {
				expect(editorFact.content).toContain("Cursor");
			}
		});
	});

	describe("3-session scenario (scenarios.md core tests)", () => {
		it("Session 1→2: direct recall works for keyword matches", async () => {
			// Session 1 — use space-separated English terms to avoid Korean particle issues
			// (Korean: "TypeScript로" becomes one token, breaking keyword match)
			// This is a known LocalAdapter limitation documented in baseline benchmark.
			const statements = [
				"I am a fullstack developer and startup CEO",
				"I mainly use TypeScript for development",
				"My editor is Neovim",
				"I use Next.js and FastAPI as frameworks",
			];
			for (const s of statements) {
				await system.encode(
					{ content: s, role: "user" },
					{ project: "naia-os" },
				);
			}

			// Session 2: Direct recall
			const editorResult = await system.recall("Neovim", { topK: 3 });
			expect(editorResult.episodes.length).toBeGreaterThan(0);

			const tsResult = await system.recall("TypeScript", { topK: 3 });
			expect(tsResult.episodes.length).toBeGreaterThan(0);

			// Abstention: Docker was never mentioned
			const dockerResult = await system.recall("Docker", { topK: 3 });
			expect(dockerResult.episodes).toHaveLength(0);
		});

		it("Session 3: new info is stored and retrievable", async () => {
			// User states new info — use English-only content to avoid Korean tokenizer issues
			// (Korean particles like "Cursor로" become a single token, breaking keyword match)
			// This is a known LocalAdapter limitation; mem0 vector search will fix it.
			await system.encode(
				{ content: "I switched to Cursor editor", role: "user" },
				{ project: "naia-os" },
			);

			const cursorResult = await system.recall("Cursor", { topK: 3 });
			expect(cursorResult.episodes.length).toBeGreaterThan(0);
			expect(cursorResult.episodes[0].content).toContain("Cursor");
		});
	});
});
