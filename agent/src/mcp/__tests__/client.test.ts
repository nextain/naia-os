import { describe, expect, it } from "vitest";
import type { McpServerConfig, McpTool, McpToolResult } from "../client.js";
import { McpClientConnection } from "../client.js";

describe("McpClientConnection", () => {
	it("creates a connection with config", () => {
		const config: McpServerConfig = {
			name: "test-server",
			command: "echo",
			args: ["hello"],
		};
		const conn = new McpClientConnection(config);
		expect(conn.isConnected).toBe(false);
		expect(conn.serverName).toBe("test-server");
	});

	it("throws when calling listTools before connect", async () => {
		const conn = new McpClientConnection({
			name: "test",
			command: "echo",
		});
		await expect(conn.listTools()).rejects.toThrow("not connected");
	});

	it("throws when calling callTool before connect", async () => {
		const conn = new McpClientConnection({
			name: "test",
			command: "echo",
		});
		await expect(conn.callTool("test", {})).rejects.toThrow("not connected");
	});

	it("close is safe when not connected", async () => {
		const conn = new McpClientConnection({
			name: "test",
			command: "echo",
		});
		// Should not throw
		await conn.close();
		expect(conn.isConnected).toBe(false);
	});
});

describe("McpServerConfig types", () => {
	it("accepts minimal config", () => {
		const config: McpServerConfig = {
			name: "minimal",
			command: "node",
		};
		expect(config.name).toBe("minimal");
		expect(config.args).toBeUndefined();
		expect(config.env).toBeUndefined();
	});

	it("accepts full config", () => {
		const config: McpServerConfig = {
			name: "full",
			command: "npx",
			args: ["-y", "@mcp/server"],
			env: { DEBUG: "1" },
		};
		expect(config.args).toHaveLength(2);
		expect(config.env?.DEBUG).toBe("1");
	});
});
