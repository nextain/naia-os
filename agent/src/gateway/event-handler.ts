/**
 * Gateway event dispatcher — handles events pushed by the Gateway
 * (e.g., exec.approval.requested, logs.entry) and forwards them
 * to the Shell via the writeLine protocol.
 */
import type { GatewayEvent } from "./types.js";

/** Pending approval entry */
export interface PendingApproval {
	requestId: string;
	resolve: (decision: "approve" | "reject") => void;
}

/** Create an event handler that dispatches Gateway events to the Shell */
export function createGatewayEventHandler(
	writeLine: (data: unknown) => void,
	_pendingApprovals: Map<string, PendingApproval>,
): (event: GatewayEvent) => void {
	return (event: GatewayEvent) => {
		const payload = (event.payload ?? {}) as Record<string, unknown>;

		switch (event.event) {
			case "exec.approval.requested":
				writeLine({
					type: "gateway_approval_request",
					requestId: payload.requestId,
					toolCallId: payload.toolCallId,
					toolName: payload.toolName,
					args: payload.args,
				});
				break;

			case "logs.entry":
				writeLine({
					type: "log_entry",
					level: payload.level,
					message: payload.message,
					timestamp: payload.timestamp,
				});
				break;

			default:
				// Unknown events are silently ignored
				break;
		}
	};
}
