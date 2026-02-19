import type { GatewayClient } from "./client.js";

/** Approval rules from exec.approvals.get */
export interface ApprovalRules {
	allowedTools: string[];
	blockedPatterns?: string[];
	[key: string]: unknown;
}

/** Get approval rules from Gateway */
export async function getApprovalRules(
	client: GatewayClient,
): Promise<ApprovalRules> {
	const payload = await client.request("exec.approvals.get", {});
	return payload as ApprovalRules;
}

/** Set approval rules on Gateway */
export async function setApprovalRules(
	client: GatewayClient,
	rules: { allowedTools?: string[]; blockedPatterns?: string[] },
): Promise<{ updated: boolean }> {
	const payload = await client.request("exec.approvals.set", rules);
	return payload as { updated: boolean };
}

/** Resolve a pending Gateway approval request */
export async function resolveApproval(
	client: GatewayClient,
	requestId: string,
	decision: "approve" | "reject",
): Promise<{ requestId: string; resolved: boolean }> {
	const payload = await client.request("exec.approvals.resolve", {
		requestId,
		decision,
	});
	return payload as { requestId: string; resolved: boolean };
}
