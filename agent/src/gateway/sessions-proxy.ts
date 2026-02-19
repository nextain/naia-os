import type { GatewayClient } from "./client.js";

/** Session info from sessions.list RPC */
export interface SessionInfo {
	key: string;
	label?: string;
	createdAt?: number;
	messageCount?: number;
	status?: string;
	[key: string]: unknown;
}

/** Result from sessions.list RPC */
export interface SessionsListResult {
	sessions: SessionInfo[];
}

/** List all gateway sessions */
export async function listSessions(
	client: GatewayClient,
	options?: { limit?: number },
): Promise<SessionsListResult> {
	const payload = await client.request("sessions.list", options ?? {});
	return payload as SessionsListResult;
}

/** Delete a gateway session */
export async function deleteSession(
	client: GatewayClient,
	key: string,
): Promise<{ deleted: boolean; key: string }> {
	const payload = await client.request("sessions.delete", { key });
	return payload as { deleted: boolean; key: string };
}

/** Compact a gateway session (remove old messages) */
export async function compactSession(
	client: GatewayClient,
	key: string,
): Promise<{ compacted: boolean; key: string; removedMessages?: number }> {
	const payload = await client.request("sessions.compact", { key });
	return payload as {
		compacted: boolean;
		key: string;
		removedMessages?: number;
	};
}

/** Preview a gateway session (summary) */
export async function previewSession(
	client: GatewayClient,
	key: string,
): Promise<{ key: string; summary: string; [k: string]: unknown }> {
	const payload = await client.request("sessions.preview", { key });
	return payload as { key: string; summary: string; [k: string]: unknown };
}

/** Patch (partially update) a gateway session */
export async function patchSession(
	client: GatewayClient,
	key: string,
	patch: Record<string, unknown>,
): Promise<{ key: string; patched: boolean }> {
	const payload = await client.request("sessions.patch", { key, ...patch });
	return payload as { key: string; patched: boolean };
}

/** Reset a gateway session (clear messages, keep metadata) */
export async function resetSession(
	client: GatewayClient,
	key: string,
): Promise<{ key: string; reset: boolean }> {
	const payload = await client.request("sessions.reset", { key });
	return payload as { key: string; reset: boolean };
}
