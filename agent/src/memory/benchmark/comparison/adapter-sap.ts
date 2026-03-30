/**
 * Super Agent Party benchmark adapter — mem0 + FAISS backend.
 *
 * Uses a persistent Python subprocess to maintain FAISS in-memory state
 * across addFact/search calls (FAISS is in-memory only).
 *
 * Requires: pip install mem0ai faiss-cpu in /tmp/sap-bench/ venv
 */
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { BenchmarkAdapter } from "./types.js";

const VENV = "/tmp/sap-bench";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";

export class SapAdapter implements BenchmarkAdapter {
	readonly name = "sap";
	readonly description =
		"Super Agent Party — mem0 + FAISS vector store + BM25 hybrid";

	private apiKey: string;
	private proc: ChildProcess | null = null;
	private buffer = "";

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async init(): Promise<void> {
		// Ensure venv and deps exist
		execSync(`python3 -m venv ${VENV} 2>/dev/null || true`, {
			stdio: "ignore",
		});
		execSync(
			`${VENV}/bin/pip install -q mem0ai faiss-cpu 2>/dev/null || true`,
			{ stdio: "ignore", timeout: 60000 },
		);

		// Write persistent worker script
		const workerScript = `
import sys, json
from mem0 import Memory

config = {
    "embedder": {"provider": "openai", "config": {
        "api_key": sys.argv[1],
        "openai_base_url": "${GEMINI_BASE}",
        "model": "gemini-embedding-001"
    }},
    "vector_store": {"provider": "faiss", "config": {"embedding_model_dims": 3072}},
    "llm": {"provider": "openai", "config": {
        "api_key": sys.argv[1],
        "openai_base_url": "${GEMINI_BASE}",
        "model": "gemini-2.5-flash"
    }}
}
m = Memory.from_config(config)
if hasattr(m.llm.config, 'store'):
    delattr(m.llm.config, 'store')

print("READY", flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        cmd = json.loads(line)
        if cmd["op"] == "add":
            m.add(cmd["content"], user_id="bench")
            print(json.dumps({"ok": True}), flush=True)
        elif cmd["op"] == "search":
            results = m.search(cmd["query"], user_id="bench", limit=cmd.get("topK", 10))
            if isinstance(results, dict):
                results = results.get("results", [])
            memories = [r.get("memory", r.get("text", "")) for r in results]
            print(json.dumps({"memories": memories}), flush=True)
        else:
            print(json.dumps({"error": "unknown op"}), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
`;
		writeFileSync("/tmp/sap-bench-worker.py", workerScript);

		// Start persistent subprocess
		this.proc = spawn(
			`${VENV}/bin/python3`,
			["/tmp/sap-bench-worker.py", this.apiKey],
			{
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		// Wait for READY
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("SAP worker timeout")),
				30000,
			);
			const onData = (data: Buffer) => {
				const text = data.toString();
				if (text.includes("READY")) {
					clearTimeout(timeout);
					this.proc?.stdout?.off("data", onData);
					resolve();
				}
			};
			this.proc?.stdout?.on("data", onData);
			this.proc?.stderr?.on("data", (d: Buffer) => {
				const err = d.toString();
				if (err.includes("Error") || err.includes("Traceback")) {
					console.error(`  SAP init stderr: ${err.slice(0, 200)}`);
				}
			});
		});
	}

	async addFact(content: string): Promise<boolean> {
		const result = await this.sendCommand({ op: "add", content });
		return result?.ok === true;
	}

	async search(query: string, topK: number): Promise<string[]> {
		const result = await this.sendCommand({ op: "search", query, topK });
		return result?.memories ?? [];
	}

	async cleanup(): Promise<void> {
		if (this.proc) {
			this.proc.stdin?.end();
			this.proc.kill();
			this.proc = null;
		}
	}

	private sendCommand(cmd: any): Promise<any> {
		return new Promise((resolve) => {
			if (!this.proc?.stdin?.writable) {
				resolve(null);
				return;
			}

			const timeout = setTimeout(() => {
				this.proc?.stdout?.off("data", onData);
				resolve(null);
			}, 60000);

			const onData = (data: Buffer) => {
				this.buffer += data.toString();
				const lines = this.buffer.split("\n");
				for (let i = 0; i < lines.length - 1; i++) {
					const line = lines[i].trim();
					if (line.startsWith("{")) {
						try {
							const parsed = JSON.parse(line);
							clearTimeout(timeout);
							this.proc?.stdout?.off("data", onData);
							this.buffer = lines.slice(i + 1).join("\n");
							resolve(parsed);
							return;
						} catch {}
					}
				}
				this.buffer = lines[lines.length - 1];
			};

			this.proc?.stdout?.on("data", onData);
			this.proc?.stdin?.write(`${JSON.stringify(cmd)}\n`);
		});
	}
}
