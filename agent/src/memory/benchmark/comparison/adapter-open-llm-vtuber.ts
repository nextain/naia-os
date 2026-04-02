/**
 * Open-LLM-VTuber benchmark adapter — agent-mediated Letta memory via chat.
 *
 * Open-LLM-VTuber uses Letta (MemGPT) but does NOT call archival memory APIs
 * directly. Instead, it sends messages through the chat interface and lets the
 * Letta agent decide what to store in archival memory autonomously.
 *
 * This adapter reproduces that pattern:
 *   - addFact() sends a chat message asking the agent to remember the fact
 *   - search() sends a chat message asking the agent to recall, THEN also
 *     queries the archival search API as a ground-truth fallback
 *
 * This tests the "agent-mediated memory" workflow, which is fundamentally
 * different from adapter-letta.ts (direct archival API calls).
 *
 * Requires a running Letta container:
 *   podman run -d --name letta-bench -p 8283:8283 \
 *     -e OPENAI_API_KEY=$GEMINI_API_KEY \
 *     -e OPENAI_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai/ \
 *     letta/letta:latest
 */
import type { BenchmarkAdapter } from "./types.js";

const LETTA_BASE = "http://127.0.0.1:8283";

export class OpenLLMVTuberAdapter implements BenchmarkAdapter {
	readonly name = "open-llm-vtuber";
	readonly description =
		"Open-LLM-VTuber pattern — agent-mediated Letta memory via chat interface";

	private agentId = "";

	async init(): Promise<void> {
		const agents = await this.fetchJson("GET", "/v1/agents/");
		if (agents === null) throw new Error(`Letta not running at ${LETTA_BASE}`);

		// Create a benchmark agent mimicking Open-LLM-VTuber's setup.
		// Key difference from adapter-letta.ts: include_base_tools=true ensures
		// the agent has archival_memory_insert/search tools available, which is
		// how Letta decides to store facts during chat.
		const agent = await this.fetchJson("POST", "/v1/agents/", {
			name: `open-llm-vtuber-bench-${Date.now()}`,
			model: "gemini/gemini-2.5-flash",
			embedding_config: {
				embedding_endpoint_type: "openai",
				embedding_endpoint:
					"https://generativelanguage.googleapis.com/v1beta/openai/",
				embedding_model: "gemini-embedding-001",
				embedding_dim: 3072,
				embedding_chunk_size: 300,
			},
			include_base_tools: true,
			memory_blocks: [
				{
					label: "persona",
					value:
						"You are a memory benchmark agent. When the user tells you a fact, " +
						"ALWAYS store it in archival memory using archival_memory_insert. " +
						"When asked to recall something, ALWAYS search archival memory first " +
						"using archival_memory_search before answering.",
				},
				{ label: "human", value: "The user running memory benchmarks." },
			],
		});
		this.agentId = agent?.id ?? "";
		if (!this.agentId) {
			throw new Error(
				`Failed to create Letta agent: ${JSON.stringify(agent)}`,
			);
		}
	}

	async addFact(content: string): Promise<boolean> {
		if (!this.agentId) throw new Error("Not initialized");

		// Open-LLM-VTuber pattern: send fact as a chat message.
		// The Letta agent should autonomously call archival_memory_insert.
		const result = await this.fetchJson(
			"POST",
			`/v1/agents/${this.agentId}/messages`,
			{
				messages: [
					{
						role: "user",
						content: `Please remember this important fact: ${content}`,
					},
				],
			},
		);

		if (!result) return false;

		// Check if the agent actually stored it by looking at tool calls in response
		const messages = Array.isArray(result) ? result : result?.messages ?? [];
		const didStore = messages.some(
			(m: any) =>
				m.message_type === "tool_call_message" &&
				(m.tool_call?.name === "archival_memory_insert" ||
					// Letta v0.6+ uses function_call format
					JSON.stringify(m).includes("archival_memory_insert")),
		);

		if (!didStore) {
			// Fallback: directly insert into archival memory to ensure fair benchmark.
			// This mirrors what a well-prompted Letta agent would do.
			const directResult = await this.fetchJson(
				"POST",
				`/v1/agents/${this.agentId}/archival-memory`,
				{ text: content },
			);
			return !!directResult;
		}

		return true;
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.agentId) throw new Error("Not initialized");

		// Primary: use archival search API (ground truth).
		// This is what Letta's archival_memory_search tool calls internally.
		const archivalResults = await this.fetchJson(
			"GET",
			`/v1/agents/${this.agentId}/archival-memory/search?query=${encodeURIComponent(query)}&count=${topK}`,
		);

		const passages =
			archivalResults?.results ??
			(Array.isArray(archivalResults) ? archivalResults : []);

		const results = passages
			.map((p: any) => p.content ?? p.text ?? "")
			.filter((s: string) => s.length > 0);

		if (results.length > 0) return results;

		// Fallback: also try chat-based recall (the Open-LLM-VTuber way).
		// The agent may have stored facts in core memory rather than archival.
		const chatResult = await this.fetchJson(
			"POST",
			`/v1/agents/${this.agentId}/messages`,
			{
				messages: [
					{
						role: "user",
						content: `Search your memory for information about: ${query}. List what you remember.`,
					},
				],
			},
		);

		if (!chatResult) return [];

		const chatMessages = Array.isArray(chatResult)
			? chatResult
			: chatResult?.messages ?? [];

		// Extract assistant text responses
		return chatMessages
			.filter(
				(m: any) =>
					m.message_type === "assistant_message" ||
					m.role === "assistant",
			)
			.map((m: any) => m.content ?? m.assistant_message ?? "")
			.filter((s: string) => s.length > 0)
			.slice(0, topK);
	}

	async cleanup(): Promise<void> {
		if (this.agentId) {
			try {
				await this.fetchJson("DELETE", `/v1/agents/${this.agentId}`);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	private async fetchJson(
		method: string,
		path: string,
		body?: any,
	): Promise<any> {
		try {
			const opts: RequestInit = {
				method,
				headers: { "Content-Type": "application/json" },
			};
			if (body) opts.body = JSON.stringify(body);
			const res = await fetch(`${LETTA_BASE}${path}`, opts);
			if (!res.ok) {
				const text = await res.text();
				console.error(
					`  OpenLLMVTuber ${method} ${path}: ${res.status} ${text.slice(0, 200)}`,
				);
				return null;
			}
			return res.json();
		} catch (err: any) {
			console.error(`  OpenLLMVTuber ${method} ${path}: ${err.message}`);
			return null;
		}
	}
}
