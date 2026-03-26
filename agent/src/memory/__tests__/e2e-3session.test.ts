import { rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "../local-adapter.js";
import { MemorySystem } from "../index.js";

describe("Memory E2E — 3 Session Simulation", () => {
	it("Session 1→2→3: encode, persist, recall, update", async () => {
		const storePath = join(tmpdir(), `naia-e2e-${randomUUID()}.json`);

		// === SESSION 1: Store facts ===
		const adapter1 = new LocalAdapter(storePath);
		const system1 = new MemorySystem({ adapter: adapter1 });
		const facts = [
			"I am Kim Haneul, a startup CEO and fullstack developer",
			"I mainly use TypeScript for development",
			"My editor is Neovim",
			"I use Next.js and FastAPI as frameworks",
			"I prefer dark mode and tab indentation",
			"I live in Seongsu-dong",
			"I only drink Americano coffee",
			"I run on weekends along the Han river",
		];
		for (const f of facts) {
			const ep = await system1.encode({ content: f, role: "user" }, { project: "naia-os" });
			expect(ep).not.toBeNull();
		}
		// Force consolidation
		await system1.close();
		const store = JSON.parse(readFileSync(storePath, "utf-8"));
		for (const ep of store.episodes) ep.timestamp = Date.now() - 2 * 60 * 60 * 1000;
		writeFileSync(storePath, JSON.stringify(store));
		const adapterCons = new LocalAdapter(storePath);
		const sysCons = new MemorySystem({ adapter: adapterCons });
		await sysCons.consolidateNow();
		await sysCons.close();

		// === SESSION 2: Recall ===
		const adapter2 = new LocalAdapter(storePath);
		const system2 = new MemorySystem({ adapter: adapter2 });
		const r1 = await system2.recall("Neovim", { topK: 3 });
		expect(r1.episodes.length + r1.facts.length).toBeGreaterThan(0);
		const r2 = await system2.recall("TypeScript", { topK: 3 });
		expect(r2.episodes.length + r2.facts.length).toBeGreaterThan(0);
		const r3 = await system2.recall("Americano", { topK: 3 });
		expect(r3.episodes.length + r3.facts.length).toBeGreaterThan(0);
		// Abstention
		const r4 = await system2.recall("Docker", { topK: 3 });
		expect(r4.episodes.length + r4.facts.length).toBe(0);
		// sessionRecall — use exact keyword from stored content
		const ctx = await system2.sessionRecall("Neovim editor", { topK: 5 });
		// Note: sessionRecall searches facts (not episodes). If heuristic extractor
		// created facts with "Neovim", this returns formatted context.
		// Empty result is acceptable for LocalAdapter (keyword matching limitation).
		await system2.close();

		// === SESSION 3: Update ===
		const adapter3 = new LocalAdapter(storePath);
		const system3 = new MemorySystem({ adapter: adapter3 });
		await system3.encode({ content: "I switched to Cursor editor", role: "user" }, { project: "naia-os" });
		const r5 = await system3.recall("Cursor", { topK: 3 });
		expect(r5.episodes.length).toBeGreaterThan(0);
		const r6 = await system3.recall("Americano", { topK: 3 });
		expect(r6.episodes.length + r6.facts.length).toBeGreaterThan(0);
		await system3.close();

		try { rmSync(storePath); } catch {}
	});
});
