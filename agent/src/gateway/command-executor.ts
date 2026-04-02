import { randomUUID } from "node:crypto";
import type {
	CommandExecuteOptions,
	CommandExecutor,
	CommandResult,
	GatewayAdapter,
} from "./types.js";

/**
 * Resolve the first paired node ID from the Gateway.
 */
async function resolveNodeId(
	client: GatewayAdapter,
): Promise<string | undefined> {
	if (!client.availableMethods.includes("node.list")) return undefined;
	try {
		const payload = await client.request("node.list", {});
		const nodes = (payload as Record<string, unknown>)?.nodes;
		if (!Array.isArray(nodes) || nodes.length === 0) return undefined;
		const node = nodes[0] as Record<string, unknown>;
		return (node.id ?? node.nodeId) as string | undefined;
	} catch {
		return undefined;
	}
}

function parseCommandPayload(payload: unknown): CommandResult {
	const rec = payload as Record<string, unknown> | null;
	// Unwrap nested result/payload from node.invoke
	const inner = (rec?.result ?? rec?.payload ?? rec) as Record<
		string,
		unknown
	> | null;
	const actual = inner && typeof inner === "object" ? inner : rec;
	const stdout =
		(actual && typeof actual.stdout === "string" ? actual.stdout : "") ||
		(actual && typeof actual.output === "string" ? actual.output : "") ||
		(typeof payload === "string" ? payload : JSON.stringify(payload));
	const exitCode =
		actual && typeof actual.exitCode === "number" ? actual.exitCode : 0;
	return {
		success: exitCode === 0,
		output: stdout,
		error: exitCode !== 0 ? String(actual?.stderr ?? "") : undefined,
	};
}

/**
 * Executes commands via Gateway RPC (exec.bash → node.invoke fallback).
 * Extracted from skills/loader.ts runCommand() — identical logic, zero behavior change.
 */
export class GatewayCommandExecutor implements CommandExecutor {
	constructor(private readonly client: GatewayAdapter) {}

	async execute(
		command: string,
		options?: CommandExecuteOptions,
	): Promise<CommandResult> {
		const methods = this.client.availableMethods;
		const workdir = options?.cwd;

		// Try exec.bash first
		if (methods.includes("exec.bash")) {
			try {
				const payload = await this.client.request("exec.bash", {
					command,
					workdir: workdir || undefined,
				});
				return parseCommandPayload(payload);
			} catch {
				// Fall through to node.invoke
			}
		}

		// Fallback: node.invoke
		if (methods.includes("node.invoke")) {
			const nodeId = await resolveNodeId(this.client);
			if (!nodeId) {
				return {
					success: false,
					output: "",
					error: "No paired node available",
				};
			}
			try {
				const payload = await this.client.request("node.invoke", {
					nodeId,
					idempotencyKey: randomUUID(),
					command: "system.run",
					params: {
						command: ["bash", "-lc", command],
						cwd: workdir || undefined,
					},
				});
				return parseCommandPayload(payload);
			} catch (err) {
				return {
					success: false,
					output: "",
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}

		return {
			success: false,
			output: "",
			error: "No command execution RPC available (exec.bash/node.invoke)",
		};
	}
}
