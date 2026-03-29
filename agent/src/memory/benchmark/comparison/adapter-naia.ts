/**
 * Naia MemorySystem(Mem0Adapter) benchmark adapter.
 */
import { randomUUID } from "node:crypto";
import type { BenchmarkAdapter } from "./types.js";
import { MemorySystem } from "../../index.js";
import { Mem0Adapter } from "../../adapters/mem0.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const THROTTLE_MS = 2000;

export class NaiaAdapter implements BenchmarkAdapter {
	readonly name = "naia";
	readonly description = "MemorySystem(Mem0Adapter) — importance gating + decay + reconsolidation + mem0 vector search";

	private system: MemorySystem | null = null;
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async init(): Promise<void> {
		const dbPath = `/tmp/mem0-bench-naia-${randomUUID()}`;
		const mem0Config = {
			embedder: { provider: "openai", config: { apiKey: this.apiKey, baseURL: GEMINI_BASE, model: "gemini-embedding-001" } },
			vectorStore: { provider: "memory", config: { collectionName: "bench", dimension: 3072, dbPath: `${dbPath}-vec.db` } },
			llm: { provider: "openai", config: { apiKey: this.apiKey, baseURL: GEMINI_BASE, model: "gemini-2.5-flash" } },
			historyDbPath: `${dbPath}-hist.db`,
		};
		const adapter = new Mem0Adapter({ mem0Config, userId: "bench" });
		this.system = new MemorySystem({ adapter });
	}

	async addFact(content: string): Promise<boolean> {
		if (!this.system) throw new Error("Not initialized");
		await new Promise((r) => setTimeout(r, THROTTLE_MS));
		const episode = await this.system.encode({ content, role: "user" }, { project: "benchmark" });
		return episode !== null;
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.system) throw new Error("Not initialized");
		await new Promise((r) => setTimeout(r, THROTTLE_MS));
		const result = await this.system.recall(query, { project: "benchmark", topK });
		const raw = [...result.facts.map((f) => f.content), ...result.episodes.map((e) => e.content)];
		return [...new Set(raw)];
	}

	async cleanup(): Promise<void> {
		if (this.system) await this.system.close();
	}
}
