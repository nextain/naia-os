import { describe, expect, it } from "vitest";
import { NativeCommandExecutor } from "../native-executor.js";

describe("NativeCommandExecutor", () => {
	const executor = new NativeCommandExecutor();

	it("executes a simple echo command", async () => {
		const result = await executor.execute("echo hello");
		expect(result.success).toBe(true);
		expect(result.output.trim()).toBe("hello");
		expect(result.error).toBeUndefined();
	});

	it("captures stdout from multi-line output", async () => {
		const result = await executor.execute("echo -e 'line1\\nline2'");
		expect(result.success).toBe(true);
		expect(result.output).toContain("line1");
		expect(result.output).toContain("line2");
	});

	it("returns failure for non-zero exit code", async () => {
		const result = await executor.execute("exit 42");
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});

	it("captures stderr on failure", async () => {
		const result = await executor.execute("echo 'error msg' >&2 && exit 1");
		expect(result.success).toBe(false);
		expect(result.error).toContain("error msg");
	});

	it("returns failure for invalid command", async () => {
		const result = await executor.execute(
			"__nonexistent_command_12345__ 2>/dev/null",
		);
		expect(result.success).toBe(false);
	});

	it("handles empty output", async () => {
		const result = await executor.execute("true");
		expect(result.success).toBe(true);
		expect(result.output).toBe("");
	});

	it("handles commands with special characters", async () => {
		const result = await executor.execute("echo 'hello world'");
		expect(result.success).toBe(true);
		expect(result.output.trim()).toBe("hello world");
	});

	it("handles pipe commands", async () => {
		const result = await executor.execute("echo 'abc' | tr 'a' 'x'");
		expect(result.success).toBe(true);
		expect(result.output.trim()).toBe("xbc");
	});

	it("respects cwd option", async () => {
		const result = await executor.execute("pwd", { cwd: "/tmp" });
		expect(result.success).toBe(true);
		expect(result.output.trim()).toBe("/tmp");
	});

	it("returns error for invalid cwd", async () => {
		const result = await executor.execute("echo test", {
			cwd: "/nonexistent_dir_12345",
		});
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});
});
