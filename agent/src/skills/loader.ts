import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { GatewayCommandExecutor } from "../gateway/command-executor.js";
import type { GatewayAdapter } from "../gateway/types.js";
import type { GatewayEvent } from "../gateway/types.js";
import { McpClientConnection } from "../mcp/client.js";
import type { SkillRegistry } from "./registry.js";
import type {
	SkillDefinition,
	SkillExecutionContext,
	SkillResult,
} from "./types.js";

interface SkillManifest {
	name: string;
	description: string;
	type: "gateway" | "command" | "mcp";
	gatewaySkill?: string;
	command?: string;
	/** MCP server configuration (for type: "mcp") */
	mcp?: {
		command: string;
		args?: string[];
		env?: Record<string, string>;
	};
	tier?: number;
	parameters?: Record<string, unknown>;
	/** Static safety declarations (optional, default false / fail-closed). */
	isConcurrencySafe?: boolean;
	isDestructive?: boolean;
	isReadOnly?: boolean;
}

function makeCommandHandler(
	command: string,
): (
	args: Record<string, unknown>,
	ctx: SkillExecutionContext,
) => Promise<SkillResult> {
	return async (_args, ctx) => {
		if (!ctx.gateway) {
			return {
				success: false,
				output: "",
				error: "Gateway connection required for command execution",
			};
		}
		const executor = new GatewayCommandExecutor(ctx.gateway);
		return executor.execute(command);
	};
}

const AGENT_TIMEOUT_MS = 120_000;

/**
 * Execute a Gateway skill by delegating to the Gateway's built-in LLM agent
 * via chat.send (streaming) or agent (batch) RPC.
 *
 * The Gateway agent reads the skill's SKILL.md and executes the appropriate
 * CLI commands. This replaces the non-existent "skills.invoke" RPC.
 */
function makeGatewayHandler(
	gatewaySkill: string,
): (
	args: Record<string, unknown>,
	ctx: SkillExecutionContext,
) => Promise<SkillResult> {
	return async (args, ctx) => {
		if (!ctx.gateway) {
			return {
				success: false,
				output: "",
				error: "Gateway connection required",
			};
		}

		// Build a natural-language prompt for the Gateway agent
		const argsDesc = Object.entries(args)
			.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
			.join(", ");
		const message = argsDesc
			? `Use the ${gatewaySkill} skill: ${argsDesc}`
			: `Use the ${gatewaySkill} skill`;

		const sessionKey = `skill:${gatewaySkill}:${Date.now()}`;
		const idempotencyKey = randomUUID();
		const client = ctx.gateway;

		try {
			return await delegateToGatewayAgent(
				client,
				message,
				sessionKey,
				idempotencyKey,
			);
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	};
}

/**
 * Send a message to the Gateway agent and collect its response.
 * Tries chat.send (streaming) first, falls back to agent (batch).
 */
async function delegateToGatewayAgent(
	client: GatewayAdapter,
	message: string,
	sessionKey: string,
	idempotencyKey: string,
): Promise<SkillResult> {
	const methods = client.availableMethods;

	if (methods.includes("chat.send")) {
		return delegateStreaming(client, message, sessionKey, idempotencyKey);
	}

	if (methods.includes("agent") && methods.includes("agent.wait")) {
		return delegateBatch(client, message, sessionKey, idempotencyKey);
	}

	return {
		success: false,
		output: "",
		error: "Gateway does not support chat.send or agent methods",
	};
}

async function delegateStreaming(
	client: GatewayAdapter,
	message: string,
	sessionKey: string,
	idempotencyKey: string,
): Promise<SkillResult> {
	const result = (await client.request("chat.send", {
		message,
		sessionKey,
		idempotencyKey,
	})) as { runId: string };

	const runId = result.runId;
	const chunks: string[] = [];

	return new Promise<SkillResult>((resolve) => {
		let settled = false;

		const settle = (success: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			client.offEvent(handler);
			resolve({ success, output: chunks.join("") || "(no response)" });
		};

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				client.offEvent(handler);
				resolve({
					success: chunks.length > 0,
					output: chunks.join("") || "Gateway agent timeout",
					error: chunks.length === 0 ? "Gateway agent timeout" : undefined,
				});
			}
		}, AGENT_TIMEOUT_MS);

		const handler = (event: GatewayEvent) => {
			if (settled) return;
			const payload = (event.payload ?? {}) as Record<string, unknown>;
			if (payload.runId && payload.runId !== runId) return;

			if (event.event === "agent") {
				const stream = payload.stream as string | undefined;
				const data = (payload.data ?? {}) as Record<string, unknown>;

				if (stream === "assistant") {
					const text = (data.delta ?? data.text ?? "") as string;
					if (text) chunks.push(text);
				} else if (stream === "lifecycle" && data.phase === "end") {
					settle(true);
				}
			} else if (event.event === "chat") {
				const state = payload.state as string | undefined;
				if (state === "final") {
					const msg = payload.message as Record<string, unknown> | undefined;
					const contentArr = msg?.content as
						| Array<Record<string, unknown>>
						| undefined;
					if (contentArr?.[0]?.text && chunks.length === 0) {
						chunks.push(contentArr[0].text as string);
					}
					settle(true);
				}
			}
		};

		client.onEvent(handler);
	});
}

async function delegateBatch(
	client: GatewayAdapter,
	message: string,
	sessionKey: string,
	idempotencyKey: string,
): Promise<SkillResult> {
	const agentResult = (await client.request("agent", {
		message,
		sessionKey,
		idempotencyKey,
	})) as { runId: string };

	await client.request("agent.wait", {
		runId: agentResult.runId,
		timeoutMs: AGENT_TIMEOUT_MS,
	});

	try {
		const transcript = (await client.request("sessions.transcript", {
			key: sessionKey,
		})) as { messages: Array<{ role: string; content: string }> };

		const assistantMsgs = transcript.messages.filter(
			(m) => m.role === "assistant",
		);
		const lastMsg = assistantMsgs[assistantMsgs.length - 1]?.content ?? "";
		return { success: true, output: lastMsg || "(no response)" };
	} catch {
		return { success: true, output: "(transcript unavailable)" };
	}
}

/** Copy bundled default skills to user's skills directory (first-run bootstrap) */
export function bootstrapDefaultSkills(
	skillsDir: string,
	bundledDir: string,
): void {
	if (!fs.existsSync(bundledDir)) return;

	fs.mkdirSync(skillsDir, { recursive: true });

	let bundled: fs.Dirent[];
	try {
		bundled = fs.readdirSync(bundledDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of bundled) {
		if (!entry.isDirectory()) continue;
		const destDir = path.join(skillsDir, entry.name);
		const destManifest = path.join(destDir, "skill.json");
		// Only copy if not already present (don't overwrite user customizations)
		if (fs.existsSync(destManifest)) continue;

		const srcManifest = path.join(bundledDir, entry.name, "skill.json");
		if (!fs.existsSync(srcManifest)) continue;

		fs.mkdirSync(destDir, { recursive: true });
		fs.copyFileSync(srcManifest, destManifest);
	}
}

/** Promise that resolves when all MCP server connections are ready */
let mcpReadyResolve: () => void;
export const mcpReady: Promise<void> = new Promise((r) => {
	mcpReadyResolve = r;
});

export function loadCustomSkills(
	registry: SkillRegistry,
	skillsDir: string,
): void {
	if (!fs.existsSync(skillsDir)) {
		mcpReadyResolve();
		return;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(skillsDir, { withFileTypes: true });
	} catch {
		mcpReadyResolve();
		return;
	}

	const mcpPromises: Promise<void>[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const manifestPath = path.join(skillsDir, entry.name, "skill.json");
		if (!fs.existsSync(manifestPath)) continue;

		let manifest: SkillManifest;
		try {
			manifest = JSON.parse(
				fs.readFileSync(manifestPath, "utf-8"),
			) as SkillManifest;
		} catch {
			continue;
		}

		if (!manifest.name || !manifest.description || !manifest.type) continue;
		if (!["gateway", "command", "mcp"].includes(manifest.type)) continue;

		const name = manifest.name.startsWith("skill_")
			? manifest.name
			: `skill_${manifest.name}`;

		// MCP type: discover tools from MCP server and register each
		if (manifest.type === "mcp" && manifest.mcp) {
			mcpPromises.push(
				loadMcpSkills(registry, manifest, name, path.join(skillsDir, entry.name)),
			);
			continue;
		}

		const isGateway = manifest.type === "gateway";
		const handler = isGateway
			? makeGatewayHandler(manifest.gatewaySkill ?? manifest.name)
			: makeCommandHandler(manifest.command ?? "echo no command");

		const skill: SkillDefinition = {
			name,
			description: manifest.description,
			parameters: manifest.parameters ?? {
				type: "object",
				properties: {},
			},
			execute: handler,
			tier: manifest.tier ?? 2,
			requiresGateway: isGateway,
			source: path.join(skillsDir, entry.name),
			// Convert static booleans from manifest to predicates
			...(manifest.isConcurrencySafe != null && {
				isConcurrencySafe: () => manifest.isConcurrencySafe!,
			}),
			...(manifest.isDestructive != null && {
				isDestructive: () => manifest.isDestructive!,
			}),
			...(manifest.isReadOnly != null && {
				isReadOnly: () => manifest.isReadOnly!,
			}),
		};

		try {
			registry.register(skill);
		} catch {
			// Skip duplicates or invalid names
		}
	}

	// Resolve mcpReady when all MCP connections complete (or immediately if none)
	if (mcpPromises.length > 0) {
		Promise.all(mcpPromises).then(() => mcpReadyResolve());
	} else {
		mcpReadyResolve();
	}
}

/** Active MCP client connections (kept alive for the process lifetime) */
const mcpConnections: McpClientConnection[] = [];

/** Close all active MCP client connections. Call on process shutdown. */
export async function closeAllMcpConnections(): Promise<void> {
	await Promise.all(mcpConnections.map((c) => c.close()));
	mcpConnections.length = 0;
}

/**
 * Connect to an MCP server, discover its tools, and register each as a skill.
 * Tool names are prefixed with the manifest name for namespacing.
 */
async function loadMcpSkills(
	registry: SkillRegistry,
	manifest: SkillManifest,
	namePrefix: string,
	source: string,
): Promise<void> {
	const mcp = manifest.mcp;
	if (!mcp) return;

	const conn = new McpClientConnection({
		name: manifest.name,
		command: mcp.command,
		args: mcp.args,
		env: mcp.env,
	});

	try {
		await conn.connect();
		const tools = await conn.listTools();
		mcpConnections.push(conn);

		for (const tool of tools) {
			const skillName = `${namePrefix}_${tool.name}`;
			const handler = makeMcpToolHandler(conn, tool.name);
			const skill: SkillDefinition = {
				name: skillName,
				description: tool.description ?? `MCP tool: ${tool.name}`,
				parameters: tool.inputSchema,
				execute: handler,
				tier: manifest.tier ?? 2,
				requiresGateway: false,
				source,
				...(manifest.isConcurrencySafe != null && {
					isConcurrencySafe: () => manifest.isConcurrencySafe!,
				}),
				...(manifest.isDestructive != null && {
					isDestructive: () => manifest.isDestructive!,
				}),
				...(manifest.isReadOnly != null && {
					isReadOnly: () => manifest.isReadOnly!,
				}),
			};
			try {
				registry.register(skill);
			} catch {
				// Skip duplicates
			}
		}
	} catch (err) {
		process.stderr.write(
			`[naia-agent] MCP server "${manifest.name}" failed: ${err instanceof Error ? err.message : String(err)}\n`,
		);
	}
}

/**
 * Create a SkillHandler that calls an MCP tool and converts the result.
 */
function makeMcpToolHandler(
	conn: McpClientConnection,
	toolName: string,
): (
	args: Record<string, unknown>,
	ctx: SkillExecutionContext,
) => Promise<SkillResult> {
	return async (args) => {
		try {
			const result = await conn.callTool(toolName, args);
			const text = result.content
				.map((c) => c.text ?? JSON.stringify(c))
				.join("\n");
			return {
				success: !result.isError,
				output: text || "(no output)",
				error: result.isError ? text : undefined,
			};
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	};
}
