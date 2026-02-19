import type { GatewayClient } from "./client.js";

/** Node info from node.list */
export interface NodeInfo {
	id: string;
	name: string;
	status: string;
	lastSeen?: number;
	[key: string]: unknown;
}

/** Device pairing info */
export interface DevicePairing {
	deviceId: string;
	nodeName: string;
	status: string;
	[key: string]: unknown;
}

/** List all nodes */
export async function listNodes(
	client: GatewayClient,
): Promise<{ nodes: NodeInfo[] }> {
	const payload = await client.request("node.list", {});
	return payload as { nodes: NodeInfo[] };
}

/** List device pairings */
export async function listDevicePairings(
	client: GatewayClient,
): Promise<{ pairings: DevicePairing[] }> {
	const payload = await client.request("device.pair.list", {});
	return payload as { pairings: DevicePairing[] };
}

/** Node detail info */
export interface NodeDetail extends NodeInfo {
	version?: string;
	platform?: string;
	capabilities?: string[];
}

/** Pair request info */
export interface PairRequest {
	requestId: string;
	nodeId?: string;
	deviceId?: string;
	status: string;
	code?: string;
	[key: string]: unknown;
}

/** Get detailed info about a node */
export async function describeNode(
	client: GatewayClient,
	nodeId: string,
): Promise<NodeDetail> {
	const payload = await client.request("node.describe", { nodeId });
	return payload as NodeDetail;
}

/** Rename a node */
export async function renameNode(
	client: GatewayClient,
	nodeId: string,
	name: string,
): Promise<{ nodeId: string; renamed: boolean }> {
	const payload = await client.request("node.rename", { nodeId, name });
	return payload as { nodeId: string; renamed: boolean };
}

/** Request pairing with a node */
export async function requestNodePair(
	client: GatewayClient,
	nodeId: string,
): Promise<PairRequest> {
	const payload = await client.request("node.pair.request", { nodeId });
	return payload as PairRequest;
}

/** List pending node pair requests */
export async function listNodePairRequests(
	client: GatewayClient,
): Promise<{ requests: PairRequest[] }> {
	const payload = await client.request("node.pair.list", {});
	return payload as { requests: PairRequest[] };
}

/** Approve a node pair request */
export async function approveNodePair(
	client: GatewayClient,
	requestId: string,
): Promise<{ requestId: string; approved: boolean }> {
	const payload = await client.request("node.pair.approve", { requestId });
	return payload as { requestId: string; approved: boolean };
}

/** Reject a node pair request */
export async function rejectNodePair(
	client: GatewayClient,
	requestId: string,
): Promise<{ requestId: string; rejected: boolean }> {
	const payload = await client.request("node.pair.reject", { requestId });
	return payload as { requestId: string; rejected: boolean };
}

/** Verify a node pair request with a code */
export async function verifyNodePair(
	client: GatewayClient,
	requestId: string,
	code: string,
): Promise<{ requestId: string; verified: boolean }> {
	const payload = await client.request("node.pair.verify", {
		requestId,
		code,
	});
	return payload as { requestId: string; verified: boolean };
}

/** Approve a device pairing */
export async function approveDevicePair(
	client: GatewayClient,
	deviceId: string,
): Promise<{ deviceId: string; approved: boolean }> {
	const payload = await client.request("device.pair.approve", { deviceId });
	return payload as { deviceId: string; approved: boolean };
}

/** Reject a device pairing */
export async function rejectDevicePair(
	client: GatewayClient,
	deviceId: string,
): Promise<{ deviceId: string; rejected: boolean }> {
	const payload = await client.request("device.pair.reject", { deviceId });
	return payload as { deviceId: string; rejected: boolean };
}

/** Rotate a device token */
export async function rotateDeviceToken(
	client: GatewayClient,
	deviceId: string,
): Promise<{ deviceId: string; token: string }> {
	const payload = await client.request("device.token.rotate", { deviceId });
	return payload as { deviceId: string; token: string };
}

/** Revoke a device token */
export async function revokeDeviceToken(
	client: GatewayClient,
	deviceId: string,
): Promise<{ deviceId: string; revoked: boolean }> {
	const payload = await client.request("device.token.revoke", { deviceId });
	return payload as { deviceId: string; revoked: boolean };
}
