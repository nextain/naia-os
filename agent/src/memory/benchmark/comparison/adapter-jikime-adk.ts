/**
 * jikime-adk benchmark adapter — Go CLI with SQLite FTS5 search.
 *
 * Requires: Go binary built at /tmp/jikime-adk
 *   cd /var/home/luke/dev/ref-jikime-adk && go build -o /tmp/jikime-adk ./cmd/jikime-adk/main.go
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { BenchmarkAdapter } from "./types.js";

const JIKIME_BIN = "/tmp/jikime-adk";

export class JikimeAdkAdapter implements BenchmarkAdapter {
	readonly name = "jikime-adk";
	readonly description =
		"jikime-adk — Go + SQLite FTS5 + Gemini vector hybrid search";

	private projectDir = "";

	async init(): Promise<void> {
		// Create a temp project directory with memory files
		this.projectDir = `/tmp/jikime-adk-bench-${randomUUID()}`;
		mkdirSync(`${this.projectDir}/memory`, { recursive: true });
		// Create initial MEMORY.md
		writeFileSync(`${this.projectDir}/MEMORY.md`, "# Memory\n\n", "utf-8");
	}

	async addFact(content: string): Promise<boolean> {
		// Append fact to a daily memory file (jikime-adk reads memory/*.md)
		const date = new Date().toISOString().slice(0, 10);
		const filePath = `${this.projectDir}/memory/${date}.md`;
		try {
			const existing = execSync(`cat "${filePath}" 2>/dev/null || echo ""`, {
				encoding: "utf-8",
			});
			writeFileSync(filePath, `${existing}\n- ${content}\n`, "utf-8");
			return true;
		} catch {
			writeFileSync(filePath, `# ${date}\n\n- ${content}\n`, "utf-8");
			return true;
		}
	}

	async search(query: string, topK: number): Promise<string[]> {
		try {
			// Use jikime-adk CLI to search with Gemini embedding
			const escapedQuery = query.replace(/'/g, "'\\''");
			const result = execSync(
				`${JIKIME_BIN} memory search '${escapedQuery}' --project '${this.projectDir}' --limit ${topK} --json 2>/dev/null`,
				{
					timeout: 30000,
					encoding: "utf-8",
					env: {
						...process.env,
						JIKIME_EMBEDDING_PROVIDER: "gemini",
						GEMINI_API_KEY: process.env.GEMINI_API_KEY,
					},
					stdio: ["pipe", "pipe", "pipe"],
				},
			);
			const parsed = JSON.parse(result.trim());
			const results = Array.isArray(parsed) ? parsed : (parsed?.results ?? []);
			return results
				.map((r: any) => r.content ?? r.text ?? r.snippet ?? "")
				.filter((s: string) => s.length > 0);
		} catch {
			// Fallback: text-based search via grep
			try {
				const result = execSync(
					`grep -rih "${query.replace(/"/g, '\\"').split(/\s+/)[0]}" "${this.projectDir}/memory/" 2>/dev/null | head -${topK}`,
					{ encoding: "utf-8", timeout: 5000 },
				);
				return result
					.split("\n")
					.map((l) => l.replace(/^- /, "").trim())
					.filter((s) => s.length > 0);
			} catch {
				return [];
			}
		}
	}

	async cleanup(): Promise<void> {
		if (this.projectDir) {
			try {
				rmSync(this.projectDir, { recursive: true, force: true });
			} catch {}
		}
	}
}
