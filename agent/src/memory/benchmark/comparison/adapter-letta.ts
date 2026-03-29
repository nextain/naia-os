/**
 * Letta (formerly MemGPT) benchmark adapter — archival memory via REST API.
 *
 * Requires a running Letta container:
 *   podman run -d --name letta-bench -p 8283:8283 \
 *     -e OPENAI_API_KEY=$GEMINI_API_KEY \
 *     -e OPENAI_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai/ \
 *     letta/letta:latest
 */
import type { BenchmarkAdapter } from "./types.js";

const LETTA_BASE = "http://127.0.0.1:8283";

export class LettaAdapter implements BenchmarkAdapter {
	readonly name = "letta";
	readonly description = "Letta (MemGPT) — agent-based archival memory with vector search";

	private agentId = "";

	async init(): Promise<void> {
		// Check Letta is running (agents endpoint returns [] when healthy)
		const agents = await this.fetchJson("GET", "/v1/agents/");
		if (agents === null) throw new Error("Letta not running at " + LETTA_BASE);

		// Create a benchmark agent with Gemini embedding via OpenAI-compatible endpoint
		const agent = await this.fetchJson("POST", "/v1/agents/", {
			name: `bench-${Date.now()}`,
			model: "gemini/gemini-2.5-flash",
			embedding_config: {
				embedding_endpoint_type: "openai",
				embedding_endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/",
				embedding_model: "gemini-embedding-001",
				embedding_dim: 3072,
				embedding_chunk_size: 300,
			},
			include_base_tools: true,
			memory_blocks: [
				{ label: "persona", value: "A memory benchmark agent." },
				{ label: "human", value: "The user." },
			],
		});
		this.agentId = agent?.id ?? "";
		if (!this.agentId) throw new Error("Failed to create Letta agent: " + JSON.stringify(agent));
	}

	async addFact(content: string): Promise<boolean> {
		if (!this.agentId) throw new Error("Not initialized");
		const result = await this.fetchJson(
			"POST",
			`/v1/agents/${this.agentId}/archival-memory`,
			{ text: content },
		);
		return !!result;
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.agentId) throw new Error("Not initialized");
		// Letta archival search
		const results = await this.fetchJson(
			"GET",
			`/v1/agents/${this.agentId}/archival-memory/search?query=${encodeURIComponent(query)}&count=${topK}`,
		);
		const passages = results?.results ?? (Array.isArray(results) ? results : []);
		return passages.map((p: any) => p.content ?? p.text ?? "").filter((s: string) => s.length > 0);
	}

	async cleanup(): Promise<void> {
		if (this.agentId) {
			try {
				await this.fetchJson("DELETE", `/v1/agents/${this.agentId}`);
			} catch {}
		}
	}

	private async fetchJson(method: string, path: string, body?: any): Promise<any> {
		try {
			const opts: RequestInit = {
				method,
				headers: { "Content-Type": "application/json" },
			};
			if (body) opts.body = JSON.stringify(body);
			const res = await fetch(`${LETTA_BASE}${path}`, opts);
			if (!res.ok) {
				const text = await res.text();
				console.error(`  Letta ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
				return null;
			}
			return res.json();
		} catch (err: any) {
			console.error(`  Letta ${method} ${path}: ${err.message}`);
			return null;
		}
	}
}
