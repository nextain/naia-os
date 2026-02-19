import type { GatewayClient } from "./client.js";

/** Agent info from agents.list RPC */
export interface AgentInfo {
	id: string;
	name: string;
	description?: string;
	model?: string;
	createdAt?: number;
	[key: string]: unknown;
}

/** Result from agents.list RPC */
export interface AgentsListResult {
	agents: AgentInfo[];
}

/** List all agents */
export async function listAgents(
	client: GatewayClient,
): Promise<AgentsListResult> {
	const payload = await client.request("agents.list", {});
	return payload as AgentsListResult;
}

/** Create a new agent */
export async function createAgent(
	client: GatewayClient,
	params: { name: string; description?: string; model?: string },
): Promise<{ id: string; name: string; created: boolean }> {
	const payload = await client.request("agents.create", params);
	return payload as { id: string; name: string; created: boolean };
}

/** Update an agent */
export async function updateAgent(
	client: GatewayClient,
	id: string,
	params: { name?: string; description?: string; model?: string },
): Promise<{ id: string; updated: boolean }> {
	const payload = await client.request("agents.update", { id, ...params });
	return payload as { id: string; updated: boolean };
}

/** Delete an agent */
export async function deleteAgent(
	client: GatewayClient,
	id: string,
): Promise<{ id: string; deleted: boolean }> {
	const payload = await client.request("agents.delete", { id });
	return payload as { id: string; deleted: boolean };
}

/** Agent file info */
export interface AgentFileInfo {
	path: string;
	size?: number;
	[key: string]: unknown;
}

/** List files belonging to an agent */
export async function listAgentFiles(
	client: GatewayClient,
	agentId: string,
): Promise<{ files: AgentFileInfo[] }> {
	const payload = await client.request("agents.files.list", { agentId });
	return payload as { files: AgentFileInfo[] };
}

/** Get content of an agent file */
export async function getAgentFile(
	client: GatewayClient,
	agentId: string,
	path: string,
): Promise<{ path: string; content: string }> {
	const payload = await client.request("agents.files.get", {
		agentId,
		path,
	});
	return payload as { path: string; content: string };
}

/** Set (create/update) content of an agent file */
export async function setAgentFile(
	client: GatewayClient,
	agentId: string,
	path: string,
	content: string,
): Promise<{ path: string; written: boolean }> {
	const payload = await client.request("agents.files.set", {
		agentId,
		path,
		content,
	});
	return payload as { path: string; written: boolean };
}
