/**
 * OpenClaw benchmark adapter — Markdown memory + Gemini vector+FTS5 hybrid search.
 *
 * Requires: ~/.openclaw/openclaw.json configured with Gemini embedding provider.
 * Env: GEMINI_API_KEY must be set.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import type { BenchmarkAdapter } from "./types.js";

const OPENCLAW_BIN = "node /home/luke/.naia/openclaw/node_modules/openclaw/openclaw.mjs";
const WORKSPACE = "/home/luke/.openclaw/workspace";

export class OpenClawAdapter implements BenchmarkAdapter {
	readonly name = "openclaw";
	readonly description = "OpenClaw (Cline) — SQLite + Gemini vector + FTS5 hybrid search";

	private facts: string[] = [];
	private originalMemory = "";

	async init(): Promise<void> {
		// Backup original MEMORY.md if exists
		try {
			this.originalMemory = execSync(`cat ${WORKSPACE}/MEMORY.md 2>/dev/null`, { encoding: "utf-8" });
		} catch { this.originalMemory = ""; }
		this.facts = [];
		mkdirSync(WORKSPACE, { recursive: true });
	}

	private indexed = false;

	async addFact(content: string): Promise<boolean> {
		this.facts.push(content);
		const md = `# Benchmark Memory\n\n${this.facts.map((f) => `- ${f}`).join("\n")}\n`;
		writeFileSync(`${WORKSPACE}/MEMORY.md`, md, "utf-8");
		this.indexed = false;
		return true;
	}

	private reindex(): void {
		if (this.indexed) return;
		try {
			execSync(`${OPENCLAW_BIN} memory index --force`, {
				timeout: 60000, encoding: "utf-8", stdio: "ignore",
				env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY },
			});
			this.indexed = true;
		} catch {}
	}

	async search(query: string, topK: number): Promise<string[]> {
		this.reindex();
		try {
			const args = ["memory", "search", query, "--max-results", String(topK), "--json"];
			const result = execSync(
				`${OPENCLAW_BIN} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")} 2>/dev/null`,
				{
					timeout: 30000, encoding: "utf-8",
					env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY },
				},
			);

			const parsed = JSON.parse(result.trim());
			const results = parsed?.results ?? (Array.isArray(parsed) ? parsed : []);
			return results.map((r: any) => r.snippet ?? r.text ?? "").filter((s: string) => s.length > 0);
		} catch (err: any) {
			console.error(`  OpenClaw search error: ${err.message?.slice(0, 100)}`);
			return [];
		}
	}

	async cleanup(): Promise<void> {
		// Restore original MEMORY.md
		if (this.originalMemory) {
			writeFileSync(`${WORKSPACE}/MEMORY.md`, this.originalMemory, "utf-8");
		} else {
			try { execSync(`rm -f ${WORKSPACE}/MEMORY.md`); } catch {}
		}
	}
}
