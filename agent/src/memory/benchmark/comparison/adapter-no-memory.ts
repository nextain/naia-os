/**
 * No-memory baseline adapter.
 *
 * Used for systems without persistent memory (project-airi WIP, Open-LLM-VTuber).
 * Always returns empty search results — equivalent to LLM-only baseline.
 */
import type { BenchmarkAdapter } from "./types.js";

export class NoMemoryAdapter implements BenchmarkAdapter {
	readonly name: string;
	readonly description: string;

	constructor(name: string, description: string) {
		this.name = name;
		this.description = description;
	}

	async init(): Promise<void> {}

	async addFact(_content: string): Promise<boolean> {
		return true; // Accept but don't store
	}

	async search(_query: string, _topK: number): Promise<string[]> {
		return []; // No memory = no results
	}

	async cleanup(): Promise<void> {}
}
