/**
 * Mem0Adapter unit tests.
 *
 * These tests verify the adapter interface works correctly.
 * mem0 OSS requires an LLM provider — tests use OpenAI-compatible
 * endpoint (Gateway or local). Skip if not available.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Check if we can actually run mem0 (needs LLM provider)
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:18789";
// mem0 integration tests require:
// 1. Gateway running with embeddings endpoint (/v1/embeddings)
// 2. LLM endpoint available (/v1/chat/completions)
// Set MEM0_LIVE_TEST=1 to enable
const canRunMem0 = process.env.MEM0_LIVE_TEST === "1";

describe.skipIf(!canRunMem0)("Mem0Adapter", () => {
	let adapter: any; // Mem0Adapter

	beforeAll(async () => {
		const { Mem0Adapter } = await import("../mem0-adapter.js");
		adapter = new Mem0Adapter({
			mem0Config: {
				embedder: {
					provider: "openai",
					config: {
						apiKey: "dummy",
						baseURL: `${GATEWAY_URL}/v1`,
						model: "text-embedding-3-small",
					},
				},
				vectorStore: {
					provider: "memory",
					config: {
						collectionName: "test-memories",
						dimension: 1536,
					},
				},
				llm: {
					provider: "openai",
					config: {
						apiKey: "dummy",
						baseURL: `${GATEWAY_URL}/v1`,
						model: "gemini-2.5-flash",
					},
				},
				historyDbPath: `/tmp/naia-mem0-test-${Date.now()}.db`,
			},
			userId: "test-user",
		});
	});

	afterAll(async () => {
		if (adapter) await adapter.close();
	});

	it("implements MemoryAdapter interface", () => {
		expect(adapter.episode).toBeDefined();
		expect(adapter.episode.store).toBeTypeOf("function");
		expect(adapter.episode.recall).toBeTypeOf("function");
		expect(adapter.episode.getRecent).toBeTypeOf("function");
		expect(adapter.semantic).toBeDefined();
		expect(adapter.semantic.upsert).toBeTypeOf("function");
		expect(adapter.semantic.search).toBeTypeOf("function");
		expect(adapter.procedural).toBeDefined();
		expect(adapter.consolidate).toBeTypeOf("function");
		expect(adapter.close).toBeTypeOf("function");
	});

	it("stores and recalls episodes via vector search", async () => {
		await adapter.episode.store({
			id: "ep-1",
			content: "나는 TypeScript로 개발하고 있어",
			summary: "TypeScript 사용",
			timestamp: Date.now(),
			importance: { importance: 0.6, surprise: 0, emotion: 0.5, utility: 0.5 },
			encodingContext: { project: "test" },
			consolidated: false,
			recallCount: 0,
			lastAccessed: Date.now(),
			strength: 0.5,
		});

		// Wait a moment for mem0 to process
		await new Promise((r) => setTimeout(r, 1000));

		const results = await adapter.episode.recall("개발 언어가 뭐야?", { topK: 3 });
		expect(results.length).toBeGreaterThan(0);
		const contents = results.map((r: any) => r.content).join(" ");
		expect(contents.toLowerCase()).toContain("typescript");
	}, 30000);

	it("semantic search finds related facts", async () => {
		await adapter.semantic.upsert({
			id: "f-1",
			content: "에디터는 Neovim 쓰고 있어",
			entities: ["Neovim"],
			topics: ["tools"],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			importance: 0.6,
			recallCount: 0,
			lastAccessed: Date.now(),
			strength: 0.5,
			sourceEpisodes: [],
		});

		await new Promise((r) => setTimeout(r, 1000));

		const results = await adapter.semantic.search("내 에디터 뭐야?", 3);
		expect(results.length).toBeGreaterThan(0);
		const contents = results.map((r: any) => r.content).join(" ");
		expect(contents.toLowerCase()).toContain("neovim");
	}, 30000);
});

describe("Mem0Adapter (offline — no LLM)", () => {
	it("can be imported without errors", async () => {
		const mod = await import("../mem0-adapter.js");
		expect(mod.Mem0Adapter).toBeDefined();
	});
});
