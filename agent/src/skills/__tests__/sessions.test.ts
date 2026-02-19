import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createSessionsSkill } from "../built-in/sessions.js";
import type { SkillDefinition } from "../types.js";

describe("skill_sessions", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "sessions.list":
						respond.ok({
							sessions: [
								{
									key: "s1",
									label: "Task 1",
									messageCount: 4,
									status: "completed",
								},
							],
						});
						break;
					case "sessions.delete":
						respond.ok({ deleted: true, key: params.key });
						break;
					case "sessions.compact":
						respond.ok({
							compacted: true,
							key: params.key,
							removedMessages: 2,
						});
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"sessions.list",
					"sessions.delete",
					"sessions.compact",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createSessionsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_sessions");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
	});

	it("lists sessions", async () => {
		const result = await skill.execute(
			{ action: "list" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.sessions).toHaveLength(1);
		expect(parsed.sessions[0].key).toBe("s1");
	});

	it("deletes a session", async () => {
		const result = await skill.execute(
			{ action: "delete", key: "s1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.deleted).toBe(true);
	});

	it("requires key for delete", async () => {
		const result = await skill.execute(
			{ action: "delete" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("key is required");
	});

	it("compacts a session", async () => {
		const result = await skill.execute(
			{ action: "compact", key: "s1" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.compacted).toBe(true);
	});

	it("returns error without gateway", async () => {
		const result = await skill.execute({ action: "list" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Gateway not connected");
	});

	it("returns error for unknown action", async () => {
		const result = await skill.execute(
			{ action: "invalid" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown action");
	});
});
