/**
 * jikime-mem benchmark adapter — SQLite + ChromaDB REST API.
 *
 * Requires jikime-mem server running:
 *   cd /home/luke/dev/ref-jikime-mem && npm run start
 *
 * Server runs on port 37888.
 */
import type { BenchmarkAdapter } from "./types.js";

const JIKIME_BASE = "http://127.0.0.1:37888";

export class JikimeMemAdapter implements BenchmarkAdapter {
	readonly name = "jikime-mem";
	readonly description = "jikime-mem — SQLite + ChromaDB session memory with hybrid search";

	private projectId = "";
	private sessionId = "";

	async init(): Promise<void> {
		const health = await this.fetchJson("GET", "/api/health");
		if (!health) throw new Error("jikime-mem not running at " + JIKIME_BASE);

		this.projectId = `bench-${Date.now()}`;
		this.sessionId = `session-${Date.now()}`;
		// Start a session
		await this.fetchJson("POST", "/api/sessions/start", {
			projectId: this.projectId,
			sessionId: this.sessionId,
			sessionName: "benchmark",
		});
	}

	async addFact(content: string): Promise<boolean> {
		const result = await this.fetchJson("POST", "/api/prompts", {
			projectId: this.projectId,
			sessionId: this.sessionId,
			content,
			type: "prompt",
		});
		return !!result;
	}

	async search(query: string, topK: number): Promise<string[]> {
		const result = await this.fetchJson("POST", "/api/search", {
			projectId: this.projectId,
			query,
			method: "hybrid",
			type: "prompt",
			limit: topK,
		});
		const results = Array.isArray(result) ? result : (result?.results ?? []);
		return results
			.map((r: any) => r.content ?? r.text ?? "")
			.filter((s: string) => s.length > 0);
	}

	async cleanup(): Promise<void> {
		if (this.sessionId) {
			try {
				await this.fetchJson("POST", "/api/sessions/stop", {
					projectId: this.projectId,
					sessionId: this.sessionId,
				});
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
			const res = await fetch(`${JIKIME_BASE}${path}`, opts);
			if (!res.ok) {
				const text = await res.text();
				console.error(`  jikime ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
				return null;
			}
			return res.json();
		} catch (err: any) {
			console.error(`  jikime ${method} ${path}: ${err.message}`);
			return null;
		}
	}
}
