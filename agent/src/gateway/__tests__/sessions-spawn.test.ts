import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { GatewayClient } from "../client.js";
import { executeSessionsSpawn } from "../sessions-spawn.js";

let mockServer: WebSocketServer;
let serverPort: number;
let client: GatewayClient;

/** Track every Gateway RPC method called, in order */
let methodCalls: string[];
/** Track params for each method call */
let paramsByMethod: Record<string, Record<string, unknown>>;

beforeAll(async () => {
	mockServer = new WebSocketServer({ port: 0 });
	serverPort = (mockServer.address() as { port: number }).port;

	mockServer.on("connection", (ws) => {
		ws.on("message", (raw) => {
			const msg = JSON.parse(raw.toString());
			if (msg.type !== "req") return;

			methodCalls.push(msg.method);
			paramsByMethod[msg.method] = msg.params as Record<string, unknown>;

			switch (msg.method) {
				case "sessions.spawn": {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: {
								runId: "run-abc-123",
								sessionKey: `subagent:${crypto.randomUUID()}`,
							},
						}),
					);
					break;
				}
				case "agent.wait": {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { status: "completed" },
						}),
					);
					break;
				}
				case "sessions.transcript": {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: {
								messages: [
									{ role: "assistant", content: "Sub-agent result here" },
								],
							},
						}),
					);
					break;
				}
				default: {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: false,
							error: { code: "UNKNOWN", message: `Unknown method: ${msg.method}` },
						}),
					);
				}
			}
		});
	});

	client = new GatewayClient();
	await client.connect(`ws://127.0.0.1:${serverPort}`, "test-token");
});

beforeAll(() => {
	methodCalls = [];
	paramsByMethod = {};
});

afterAll(() => {
	client.close();
	mockServer.close();
});

describe("executeSessionsSpawn", () => {
	// Reset tracking before each test
	beforeAll(() => {
		methodCalls = [];
		paramsByMethod = {};
	});

	it("calls RPCs in correct order: spawn → wait → transcript", async () => {
		methodCalls = [];
		await executeSessionsSpawn(client, { task: "Analyze the log files" });
		expect(methodCalls).toEqual([
			"sessions.spawn",
			"agent.wait",
			"sessions.transcript",
		]);
	});

	it("returns output from sub-agent transcript", async () => {
		const result = await executeSessionsSpawn(client, {
			task: "Summarize the README",
		});
		expect(result.success).toBe(true);
		expect(result.output).toContain("Sub-agent result here");
	});

	it("passes task and label to sessions.spawn params", async () => {
		paramsByMethod = {};
		await executeSessionsSpawn(client, {
			task: "Check disk usage",
			label: "disk-check",
		});
		const spawnParams = paramsByMethod["sessions.spawn"];
		expect(spawnParams).toBeDefined();
		expect(spawnParams.task).toBe("Check disk usage");
		expect(spawnParams.label).toBe("disk-check");
	});

	it("passes sessionKey from spawn to transcript request", async () => {
		paramsByMethod = {};
		await executeSessionsSpawn(client, { task: "Check system status" });
		const transcriptParams = paramsByMethod["sessions.transcript"];
		expect(transcriptParams).toBeDefined();
		expect(typeof transcriptParams.key).toBe("string");
		expect((transcriptParams.key as string).startsWith("subagent:")).toBe(true);
	});

	it("handles agent.wait timeout error", async () => {
		const timeoutServer = new WebSocketServer({ port: 0 });
		const timeoutPort = (timeoutServer.address() as { port: number }).port;

		timeoutServer.on("connection", (ws) => {
			ws.on("message", (raw) => {
				const msg = JSON.parse(raw.toString());
				if (msg.type !== "req") return;

				if (msg.method === "sessions.spawn") {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: true,
							payload: { runId: "timeout-run", sessionKey: "subagent:timeout" },
						}),
					);
				} else if (msg.method === "agent.wait") {
					ws.send(
						JSON.stringify({
							type: "res",
							id: msg.id,
							ok: false,
							error: { code: "TIMEOUT", message: "Agent run timed out" },
						}),
					);
				}
			});
		});

		const timeoutClient = new GatewayClient();
		await timeoutClient.connect(`ws://127.0.0.1:${timeoutPort}`, "test-token");

		const result = await executeSessionsSpawn(timeoutClient, {
			task: "Long running task",
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("timed out");

		timeoutClient.close();
		timeoutServer.close();
	});

	it("returns error when Gateway is not connected", async () => {
		const disconnected = new GatewayClient();
		const result = await executeSessionsSpawn(disconnected, {
			task: "This should fail",
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("not connected");
	});
});
