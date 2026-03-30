/**
 * Raw mem0 OSS benchmark adapter — no Naia layer.
 */
import { randomUUID } from "node:crypto";
import type { BenchmarkAdapter } from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const THROTTLE_MS = 2000;

export class Mem0Adapter implements BenchmarkAdapter {
	readonly name = "mem0";
	readonly description =
		"mem0 OSS — vector search only, no importance gating or decay";

	private mem0: any = null;
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async init(): Promise<void> {
		const { Memory } = await import("mem0ai/oss");
		const dbPath = `/tmp/mem0-bench-raw-${randomUUID()}`;
		this.mem0 = new Memory({
			embedder: {
				provider: "openai",
				config: {
					apiKey: this.apiKey,
					baseURL: GEMINI_BASE,
					model: "gemini-embedding-001",
				},
			},
			vectorStore: {
				provider: "memory",
				config: {
					collectionName: "bench",
					dimension: 3072,
					dbPath: `${dbPath}-vec.db`,
				},
			},
			llm: {
				provider: "openai",
				config: {
					apiKey: this.apiKey,
					baseURL: GEMINI_BASE,
					model: "gemini-2.5-flash",
				},
			},
			historyDbPath: `${dbPath}-hist.db`,
		});
	}

	async addFact(content: string): Promise<boolean> {
		if (!this.mem0) throw new Error("Not initialized");
		await new Promise((r) => setTimeout(r, THROTTLE_MS));
		await this.mem0.add([{ role: "user", content }], { userId: "bench" });
		return true;
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.mem0) throw new Error("Not initialized");
		await new Promise((r) => setTimeout(r, THROTTLE_MS));
		const raw = await this.mem0.search(query, { userId: "bench", limit: topK });
		return [
			...new Set(
				(raw?.results ?? raw ?? []).map((r: any) => r.memory ?? r.text ?? ""),
			),
		] as string[];
	}

	async cleanup(): Promise<void> {
		// mem0 has no explicit close
	}
}
