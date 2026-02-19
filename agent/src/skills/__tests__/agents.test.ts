import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createAgentsSkill } from "../built-in/agents.js";
import type { SkillDefinition } from "../types.js";

describe("skill_agents", () => {
	let mock: MockGateway;
	let client: GatewayClient;
	let skill: SkillDefinition;

	beforeAll(async () => {
		mock = createMockGateway(
			(method, params, respond) => {
				switch (method) {
					case "agents.list":
						respond.ok({
							agents: [
								{ id: "alpha", name: "Alpha", model: "gemini-2.0-flash" },
								{ id: "coder", name: "Coder", model: "gemini-2.0-flash" },
							],
						});
						break;
					case "agents.create":
						respond.ok({
							id: `new-${Date.now()}`,
							name: params.name,
							created: true,
						});
						break;
					case "agents.update":
						respond.ok({ id: params.id, updated: true });
						break;
					case "agents.delete":
						respond.ok({ id: params.id, deleted: true });
						break;
					default:
						respond.error("UNKNOWN", `Unknown: ${method}`);
				}
			},
			{
				methods: [
					"exec.bash",
					"agents.list",
					"agents.create",
					"agents.update",
					"agents.delete",
				],
			},
		);

		client = new GatewayClient();
		await client.connect(`ws://127.0.0.1:${mock.port}`, {
			token: "test-token",
		});
		skill = createAgentsSkill();
	});

	afterAll(() => {
		client.close();
		mock.close();
	});

	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_agents");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
	});

	it("lists agents", async () => {
		const result = await skill.execute(
			{ action: "list" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.agents).toHaveLength(2);
		expect(parsed.agents[0].name).toBe("Alpha");
	});

	it("creates an agent", async () => {
		const result = await skill.execute(
			{ action: "create", name: "Writer", description: "Creative writer" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.created).toBe(true);
		expect(parsed.name).toBe("Writer");
	});

	it("requires name for create", async () => {
		const result = await skill.execute(
			{ action: "create" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("name is required");
	});

	it("updates an agent", async () => {
		const result = await skill.execute(
			{ action: "update", id: "alpha", name: "Alpha v2" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.updated).toBe(true);
	});

	it("requires id for update", async () => {
		const result = await skill.execute(
			{ action: "update", name: "x" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("id is required");
	});

	it("deletes an agent", async () => {
		const result = await skill.execute(
			{ action: "delete", id: "coder" },
			{ gateway: client },
		);
		expect(result.success).toBe(true);
		const parsed = JSON.parse(result.output);
		expect(parsed.deleted).toBe(true);
	});

	it("requires id for delete", async () => {
		const result = await skill.execute(
			{ action: "delete" },
			{ gateway: client },
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("id is required");
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
