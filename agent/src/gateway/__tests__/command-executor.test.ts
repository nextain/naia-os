import { describe, expect, it, vi } from "vitest";
import { GatewayCommandExecutor } from "../command-executor.js";
import type { CommandExecutor, GatewayAdapter } from "../types.js";

function createMockAdapter(
	methods: string[],
	handler?: (method: string, params: unknown) => unknown,
): GatewayAdapter {
	return {
		request: vi.fn(async (method: string, params: unknown) => {
			if (handler) return handler(method, params);
			return { stdout: "ok", exitCode: 0 };
		}),
		onEvent: vi.fn(),
		offEvent: vi.fn(),
		close: vi.fn(),
		isConnected: () => true,
		availableMethods: methods,
	};
}

describe("GatewayCommandExecutor", () => {
	it("uses exec.bash when available", async () => {
		const adapter = createMockAdapter(["exec.bash"], () => ({
			stdout: "hello",
			exitCode: 0,
		}));

		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("echo hello");

		expect(result.success).toBe(true);
		expect(result.output).toBe("hello");
		expect(adapter.request).toHaveBeenCalledWith("exec.bash", {
			command: "echo hello",
		});
	});

	it("falls back to node.invoke when exec.bash fails", async () => {
		const adapter = createMockAdapter(
			["exec.bash", "node.invoke", "node.list"],
			(method) => {
				if (method === "exec.bash") throw new Error("exec.bash failed");
				if (method === "node.list") return { nodes: [{ id: "node-1" }] };
				// node.invoke
				return {
					result: { stdout: "fallback output", exitCode: 0 },
				};
			},
		);

		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("ls");

		expect(result.success).toBe(true);
		expect(result.output).toBe("fallback output");
	});

	it("returns error when no execution method is available", async () => {
		const adapter = createMockAdapter([]);
		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("echo test");

		expect(result.success).toBe(false);
		expect(result.error).toContain("No command execution RPC available");
	});

	it("returns error when node.invoke exists but node.list does not", async () => {
		const adapter = createMockAdapter(["node.invoke"]);

		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("echo test");

		expect(result.success).toBe(false);
		expect(result.error).toContain("No paired node available");
	});

	it("returns error when node.invoke has no paired node", async () => {
		const adapter = createMockAdapter(
			["node.invoke", "node.list"],
			(method) => {
				if (method === "node.list") return { nodes: [] };
				return {};
			},
		);

		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("echo test");

		expect(result.success).toBe(false);
		expect(result.error).toContain("No paired node available");
	});

	it("parses non-zero exit code as failure", async () => {
		const adapter = createMockAdapter(["exec.bash"], () => ({
			stdout: "",
			stderr: "command not found",
			exitCode: 127,
		}));

		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("bad-command");

		expect(result.success).toBe(false);
		expect(result.error).toBe("command not found");
	});

	it("handles string payload", async () => {
		const adapter = createMockAdapter(["exec.bash"], () => "raw string output");

		const executor = new GatewayCommandExecutor(adapter);
		const result = await executor.execute("echo test");

		expect(result.success).toBe(true);
		expect(result.output).toBe("raw string output");
	});
});

describe("CommandExecutor interface", () => {
	it("allows custom implementations", async () => {
		const custom: CommandExecutor = {
			execute: async (command: string) => ({
				success: true,
				output: `custom: ${command}`,
			}),
		};

		const result = await custom.execute("test");
		expect(result.output).toBe("custom: test");
	});
});
