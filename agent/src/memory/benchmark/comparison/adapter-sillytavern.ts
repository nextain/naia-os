/**
 * SillyTavern benchmark adapter — vectra + transformers.js embeddings.
 *
 * SillyTavern's memory system has two components:
 *   1. "Memory" extension — LLM-based rolling chat summary (not vector-based)
 *   2. "Vectors" extension — vectra (local JSON vector index) + pluggable embeddings
 *
 * This adapter replicates the Vectors extension pipeline directly:
 *   - vectra ^0.2.2 for storage (same LocalIndex that SillyTavern uses)
 *   - @huggingface/transformers for local embeddings (SillyTavern default: all-mpnet-base-v2)
 *
 * No running SillyTavern server is required — we use the same libraries directly.
 * This is an honest benchmark of SillyTavern's vector storage capability.
 *
 * Source references:
 *   - src/endpoints/vectors.js — server-side vectra insert/query/delete
 *   - src/vectors/embedding.js — transformers.js embedding (feature-extraction pipeline)
 *   - src/transformers.js — pipeline config (Xenova/all-mpnet-base-v2, mean pooling, normalize)
 *   - public/scripts/extensions/vectors/index.js — client-side orchestration
 *
 * Install: npm install vectra @huggingface/transformers
 */
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { BenchmarkAdapter } from "./types.js";

/** SillyTavern default embedding model (see src/transformers.js → feature-extraction) */
const DEFAULT_MODEL = "Xenova/all-mpnet-base-v2";

/** SillyTavern default query threshold (vectors extension default) */
const DEFAULT_THRESHOLD = 0.0;

export class SillyTavernAdapter implements BenchmarkAdapter {
	readonly name = "sillytavern";
	readonly description =
		"SillyTavern — vectra local vector index + transformers.js embeddings (all-mpnet-base-v2)";

	private indexPath = "";
	private store: any = null;
	private pipeline: any = null;
	private factCounter = 0;

	async init(cacheId?: string): Promise<void> {
		// Dynamic imports — optional benchmark deps
		const vectra = await import("vectra");
		const { pipeline: createPipeline } = await import("@huggingface/transformers");

		// cacheId: fixed path for --skip-encode reuse. Without it, use random UUID (fresh index).
		this.indexPath = cacheId
			? `/tmp/sillytavern-bench-${cacheId}`
			: `/tmp/sillytavern-bench-${randomUUID()}`;
		this.store = new vectra.LocalIndex(this.indexPath);

		if (!(await this.store.isIndexCreated())) {
			await this.store.createIndex();
		}

		// Load the feature-extraction pipeline — same as SillyTavern's getTransformersVector()
		// Uses mean pooling + normalize, matching src/vectors/embedding.js
		this.pipeline = await createPipeline("feature-extraction", DEFAULT_MODEL);
	}

	async addFact(content: string): Promise<boolean> {
		if (!this.store || !this.pipeline) throw new Error("Not initialized");

		const vector = await this.embed(content);
		const hash = this.simpleHash(content);

		await this.store.beginUpdate();
		await this.store.upsertItem({
			vector,
			metadata: {
				hash,
				text: content,
				index: this.factCounter++,
			},
		});
		await this.store.endUpdate();

		return true;
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.store || !this.pipeline) throw new Error("Not initialized");

		const vector = await this.embed(query);
		const results = await this.store.queryItems(vector, topK);

		return results
			.filter((r: any) => r.score >= DEFAULT_THRESHOLD)
			.map((r: any) => r.item.metadata.text as string);
	}

	async cleanup(): Promise<void> {
		this.store = null;
		this.pipeline = null;
		if (this.indexPath) {
			try {
				rmSync(this.indexPath, { recursive: true, force: true });
			} catch {
				// Ignore cleanup failures
			}
		}
	}

	/**
	 * Embed text using the transformers.js pipeline.
	 * Matches SillyTavern's getTransformersVector():
	 *   pipe(text, { pooling: 'mean', normalize: true })
	 */
	private async embed(text: string): Promise<number[]> {
		const result = await this.pipeline(text, {
			pooling: "mean",
			normalize: true,
		});
		return Array.from(result.data) as number[];
	}

	/**
	 * Simple string hash matching SillyTavern's getStringHash() pattern.
	 * Used as metadata key for upsert deduplication.
	 */
	private simpleHash(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0; // Convert to 32-bit integer
		}
		return hash;
	}
}
