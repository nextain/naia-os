import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SkillRegistry } from "../../skills/registry.js";
import { NaiaMcpServer } from "../server.js";

describe("NaiaMcpServer", () => {
	it("creates server from empty registry", () => {
		const registry = new SkillRegistry();
		const server = new NaiaMcpServer(registry);
		expect(server).toBeDefined();
	});

	describe("roundtrip via InMemoryTransport", () => {
		let client: Client;
		let registry: SkillRegistry;

		beforeAll(async () => {
			registry = new SkillRegistry();
			registry.register({
				name: "skill_echo",
				description: "Echo input text",
				parameters: {
					type: "object",
					properties: { text: { type: "string" } },
					required: ["text"],
				},
				execute: async (args) => ({
					success: true,
					output: `echo: ${args.text}`,
				}),
				tier: 0,
				requiresGateway: false,
				source: "built-in",
			});
			registry.register({
				name: "skill_fail",
				description: "Always fails",
				parameters: { type: "object", properties: {} },
				execute: async () => ({
					success: false,
					output: "something went wrong",
				}),
				tier: 0,
				requiresGateway: false,
				source: "built-in",
			});

			const mcpServer = new NaiaMcpServer(registry, "test", "1.0.0");
			client = new Client({ name: "test-client", version: "1.0.0" });

			const [clientTransport, serverTransport] =
				InMemoryTransport.createLinkedPair();
			await mcpServer.connectTransport(serverTransport);
			await client.connect(clientTransport);
		});

		afterAll(async () => {
			await client.close();
		});

		it("lists tools with skill_ prefix stripped", async () => {
			const { tools } = await client.listTools();
			const names = tools.map((t) => t.name);
			expect(names).toContain("echo");
			expect(names).toContain("fail");
			expect(names).not.toContain("skill_echo");
		});

		it("calls a tool and returns text content", async () => {
			const result = await client.callTool({
				name: "echo",
				arguments: { text: "hello" },
			});
			expect(result.isError).toBeFalsy();
			const text = (result.content as Array<{ text: string }>)[0]?.text;
			expect(text).toBe("echo: hello");
		});

		it("returns isError for failed skill", async () => {
			const result = await client.callTool({
				name: "fail",
				arguments: {},
			});
			expect(result.isError).toBe(true);
		});

		it("returns error for unknown tool", async () => {
			const result = await client.callTool({
				name: "nonexistent",
				arguments: {},
			});
			expect(result.isError).toBe(true);
			const text = (result.content as Array<{ text: string }>)[0]?.text;
			expect(text).toContain("Unknown tool");
		});
	});
});
