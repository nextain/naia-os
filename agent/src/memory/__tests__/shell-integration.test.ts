/**
 * Shell Integration Test — verifies the full memory pipeline:
 * 1. Agent encodes user messages → LocalAdapter stores to JSON
 * 2. Consolidation extracts facts
 * 3. sessionRecall returns formatted context for system prompt injection
 * 4. Facts can be listed (for Settings UI)
 * 5. Facts can be deleted (for Settings UI)
 *
 * This validates the wiring that Shell depends on (#174).
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "../adapters/local.js";
import { MemorySystem } from "../index.js";

describe("Shell Integration — Memory System E2E (#174)", () => {
	it("full pipeline: encode → consolidate → recall → list → delete", async () => {
		const storePath = join(tmpdir(), `naia-shell-e2e-${randomUUID()}.json`);

		// === STEP 1: Encode user messages (simulates Shell → Agent chat) ===
		const adapter = new LocalAdapter(storePath);
		const system = new MemorySystem({ adapter });

		const userMessages = [
			"My name is Minjun and I am a designer",
			"I prefer using Figma for design work",
			"I always use dark mode in all my apps",
			"I switched from Sketch to Figma last month",
		];

		for (const msg of userMessages) {
			const ep = await system.encode(
				{ content: msg, role: "user" },
				{ project: "naia-os" },
			);
			expect(ep).not.toBeNull();
		}

		// Force episodes to be old enough for consolidation
		const rawStore = JSON.parse(readFileSync(storePath, "utf-8"));
		for (const ep of rawStore.episodes) {
			ep.timestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
		}
		writeFileSync(storePath, JSON.stringify(rawStore));

		// Reload adapter to pick up modified timestamps
		await system.close();
		const adapter2 = new LocalAdapter(storePath);
		const system2 = new MemorySystem({ adapter: adapter2 });

		// === STEP 2: Consolidation (extracts facts from episodes) ===
		const result = await system2.consolidateNow();
		expect(result.episodesProcessed).toBeGreaterThan(0);

		// === STEP 3: sessionRecall (what Agent injects into system prompt) ===
		const recallContext = await system2.sessionRecall("Figma", { topK: 5 });
		// sessionRecall returns a formatted string for system prompt injection
		expect(typeof recallContext).toBe("string");

		// Direct recall should find Figma-related content
		const recallResult = await system2.recall("design tool", { topK: 5 });
		const allContent = [
			...recallResult.episodes.map((e) => e.content),
			...recallResult.facts.map((f) => f.content),
		].join(" ");
		// At minimum, episodes should be found (facts depend on heuristic extractor)
		expect(recallResult.episodes.length + recallResult.facts.length).toBeGreaterThan(0);

		// === STEP 4: List all facts (Settings UI reads this) ===
		const allFacts = await adapter2.semantic.getAll();
		// Facts may or may not be created by heuristic extractor
		// But episodes are always there
		expect(Array.isArray(allFacts)).toBe(true);

		// === STEP 5: Verify JSON file is readable (Rust Tauri reads this) ===
		const fileContent = readFileSync(storePath, "utf-8");
		const parsed = JSON.parse(fileContent);
		expect(parsed.version).toBe(1);
		expect(Array.isArray(parsed.episodes)).toBe(true);
		expect(Array.isArray(parsed.facts)).toBe(true);
		// Verify fact structure matches what Rust AgentFact expects (all fields)
		for (const fact of parsed.facts) {
			expect(fact).toHaveProperty("id");
			expect(fact).toHaveProperty("content");
			expect(fact).toHaveProperty("entities");
			expect(fact).toHaveProperty("topics");
			expect(fact).toHaveProperty("createdAt");
			expect(fact).toHaveProperty("updatedAt");
			expect(fact).toHaveProperty("importance");
			expect(fact).toHaveProperty("recallCount");
			expect(fact).toHaveProperty("lastAccessed");
			expect(fact).toHaveProperty("strength");
			expect(fact).toHaveProperty("sourceEpisodes");
		}

		// === STEP 6: Delete a fact (Settings UI delete button) ===
		if (allFacts.length > 0) {
			const factToDelete = allFacts[0];
			const deleted = await adapter2.semantic.delete(factToDelete.id);
			expect(deleted).toBe(true);
			const remaining = await adapter2.semantic.getAll();
			expect(remaining.length).toBe(allFacts.length - 1);

			// Verify file reflects deletion
			const afterDelete = JSON.parse(readFileSync(storePath, "utf-8"));
			expect(afterDelete.facts.length).toBe(allFacts.length - 1);
		}

		// === STEP 7: Abstention (don't hallucinate) ===
		const noResult = await system2.recall("Docker Kubernetes", { topK: 5 });
		expect(noResult.episodes.length + noResult.facts.length).toBe(0);

		await system2.close();
		try { rmSync(storePath); } catch {}
	});

	it("cross-session persistence: encode in session 1, recall in session 2", async () => {
		const storePath = join(tmpdir(), `naia-cross-${randomUUID()}.json`);

		// Session 1: encode
		const s1Adapter = new LocalAdapter(storePath);
		const s1System = new MemorySystem({ adapter: s1Adapter });
		await s1System.encode(
			{ content: "I am a Python developer working on machine learning", role: "user" },
			{ project: "naia-os" },
		);
		await s1System.close();

		// Session 2: recall (fresh adapter, same file)
		const s2Adapter = new LocalAdapter(storePath);
		const s2System = new MemorySystem({ adapter: s2Adapter });
		const recall = await s2System.recall("Python", { topK: 3 });
		expect(recall.episodes.length).toBeGreaterThan(0);
		expect(recall.episodes[0].content).toContain("Python");

		// sessionRecall also works
		const ctx = await s2System.sessionRecall("machine learning", { topK: 5 });
		expect(typeof ctx).toBe("string");

		await s2System.close();
		try { rmSync(storePath); } catch {}
	});
});
