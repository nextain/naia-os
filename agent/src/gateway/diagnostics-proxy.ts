import type { GatewayClient } from "./client.js";

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
export async function getHealth(
	client: GatewayClient,
): Promise<HealthResult> {
	const payload = await client.request("health", {});
	return payload as HealthResult;
}

/** Get usage statistics */
export async function getUsageStatus(
	client: GatewayClient,
): Promise<UsageStatusResult> {
	const payload = await client.request("usage.status", {});
	return payload as UsageStatusResult;
}

/** Get usage cost breakdown */
export async function getUsageCost(
	client: GatewayClient,
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
	client: GatewayClient,
): Promise<GatewayStatusResult> {
	const payload = await client.request("status", {});
	return payload as GatewayStatusResult;
}

/** Start tailing Gateway logs (logs will arrive as events) */
export async function startLogsTail(
	client: GatewayClient,
): Promise<{ tailing: boolean }> {
	const payload = await client.request("logs.tail", { action: "start" });
	return payload as { tailing: boolean };
}

/** Stop tailing Gateway logs */
export async function stopLogsTail(
	client: GatewayClient,
): Promise<{ tailing: boolean }> {
	const payload = await client.request("logs.tail", { action: "stop" });
	return payload as { tailing: boolean };
}
