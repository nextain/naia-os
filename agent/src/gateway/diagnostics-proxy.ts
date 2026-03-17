import type { GatewayAdapter } from "./types.js";

/** Health check result */
export interface HealthResult {
	status: string;
	uptime: number;
	version: string;
	[key: string]: unknown;
}

/** Usage status result */
export interface UsageStatusResult {
	totalRequests: number;
	totalTokens: number;
	activeProviders?: string[];
	[key: string]: unknown;
}

/** Usage cost result */
export interface UsageCostResult {
	totalCost: number;
	breakdown: Array<{ provider: string; cost: number }>;
	[key: string]: unknown;
}

/** Get Gateway health status */
export async function getHealth(client: GatewayAdapter): Promise<HealthResult> {
	const payload = await client.request("health", {});
	return payload as HealthResult;
}

/** Get usage statistics */
export async function getUsageStatus(
	client: GatewayAdapter,
): Promise<UsageStatusResult> {
	const payload = await client.request("usage.status", {});
	return payload as UsageStatusResult;
}

/** Get usage cost breakdown */
export async function getUsageCost(
	client: GatewayAdapter,
): Promise<UsageCostResult> {
	const payload = await client.request("usage.cost", {});
	return payload as UsageCostResult;
}

/** Gateway status result */
export interface GatewayStatusResult {
	status: string;
	gateway: string;
	connectedClients?: number;
	[key: string]: unknown;
}

/** Get overall Gateway status */
export async function getGatewayStatus(
	client: GatewayAdapter,
): Promise<GatewayStatusResult> {
	const payload = await client.request("status", {});
	return payload as GatewayStatusResult;
}

/** Result from logs.tail RPC (cursor-based polling) */
export interface LogsTailResult {
	file: string;
	cursor: number;
	size: number;
	lines: string[];
}

/**
 * Poll Gateway logs. First call with no cursor returns recent lines + cursor.
 * Subsequent calls with cursor return only new lines since that cursor.
 */
export async function pollLogsTail(
	client: GatewayAdapter,
	cursor?: number,
): Promise<LogsTailResult> {
	const params = cursor != null ? { cursor } : {};
	const payload = await client.request("logs.tail", params);
	return payload as LogsTailResult;
}
