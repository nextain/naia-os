import type { GatewayClient } from "./client.js";
import type { ToolResult } from "./tool-bridge.js";

export interface SessionsSpawnArgs {
	task: string;
	label?: string;
}

interface SpawnPayload {
	runId: string;
	sessionKey: string;
}

interface TranscriptPayload {
	messages: Array<{ role: string; content: string }>;
}

const AGENT_WAIT_TIMEOUT_MS = 120_000;

/**
 * Spawn a sub-agent session via the Gateway.
 *
 * Flow: sessions.spawn → agent.wait → sessions.transcript
 * The sub-agent runs in a separate session and cannot spawn further sub-agents (depth=1).
 */
export async function executeSessionsSpawn(
	client: GatewayClient,
	args: SessionsSpawnArgs,
): Promise<ToolResult> {
	if (!client.isConnected()) {
		return { success: false, output: "", error: "Gateway not connected" };
	}

	try {
		// 1. Spawn sub-agent session
		const spawnResult = (await client.request("sessions.spawn", {
			task: args.task,
			label: args.label,
		})) as SpawnPayload;

		const { runId, sessionKey } = spawnResult;

		// 2. Wait for sub-agent to complete
		await client.request("agent.wait", {
			runId,
			timeoutMs: AGENT_WAIT_TIMEOUT_MS,
		});

		// 3. Retrieve transcript from completed session
		const transcript = (await client.request("sessions.transcript", {
			key: sessionKey,
		})) as TranscriptPayload;

		// Extract last assistant message as the result
		const assistantMessages = transcript.messages.filter(
			(m) => m.role === "assistant",
		);
		const lastMessage =
			assistantMessages[assistantMessages.length - 1]?.content ?? "";

		return { success: true, output: lastMessage };
	} catch (err) {
		const message = String(err);
		return { success: false, output: "", error: message };
	}
}
