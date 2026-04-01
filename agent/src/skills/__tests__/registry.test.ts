import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../registry.js";
import type { SkillDefinition, SkillResult } from "../types.js";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
	return {
		name: overrides.name ?? "skill_test",
		description: overrides.description ?? "A test skill",
		parameters: overrides.parameters ?? {
			type: "object",
			properties: {},
		},
		execute:
			overrides.execute ?? (async () => ({ success: true, output: "ok" })),
		tier: overrides.tier ?? 0,
		requiresGateway: overrides.requiresGateway ?? false,
		source: overrides.source ?? "built-in",
		...(overrides.isConcurrencySafe && {
			isConcurrencySafe: overrides.isConcurrencySafe,
		}),
		...(overrides.isDestructive && { isDestructive: overrides.isDestructive }),
		...(overrides.isReadOnly && { isReadOnly: overrides.isReadOnly }),
	};
}

describe("SkillRegistry", () => {
	it("registers and retrieves a skill", () => {
		const registry = new SkillRegistry();
		const skill = makeSkill();
		registry.register(skill);
		const retrieved = registry.get("skill_test");
		expect(retrieved).toBeDefined();
		expect(retrieved!.name).toBe(skill.name);
		expect(retrieved!.description).toBe(skill.description);
		expect(retrieved!.execute).toBe(skill.execute);
	});

	it("has() returns true for registered skills", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill());
		expect(registry.has("skill_test")).toBe(true);
		expect(registry.has("skill_nonexistent")).toBe(false);
	});

	it("list() returns all registered skills", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_a" }));
		registry.register(makeSkill({ name: "skill_b" }));
		const names = registry.list().map((s) => s.name);
		expect(names).toEqual(["skill_a", "skill_b"]);
	});

	it("execute() calls the skill handler and returns result", async () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				execute: async (args) => ({
					success: true,
					output: `hello ${args.name}`,
				}),
			}),
		);
		const result = await registry.execute("skill_test", { name: "world" }, {});
		expect(result.success).toBe(true);
		expect(result.output).toBe("hello world");
	});

	it("execute() returns error for unknown skill", async () => {
		const registry = new SkillRegistry();
		const result = await registry.execute("skill_unknown", {}, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown skill");
	});

	it("execute() catches handler errors", async () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				execute: async () => {
					throw new Error("boom");
				},
			}),
		);
		const result = await registry.execute("skill_test", {}, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("boom");
	});

	it("toToolDefinitions() converts skills to ToolDefinitions", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_time" }));
		const tools = registry.toToolDefinitions(true);
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("skill_time");
		expect(tools[0].description).toBeDefined();
		expect(tools[0].parameters).toBeDefined();
	});

	it("toToolDefinitions() filters out gateway skills when hasGateway=false", () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({ name: "skill_local", requiresGateway: false }),
		);
		registry.register(
			makeSkill({ name: "skill_remote", requiresGateway: true }),
		);

		const withGateway = registry.toToolDefinitions(true);
		expect(withGateway).toHaveLength(2);

		const withoutGateway = registry.toToolDefinitions(false);
		expect(withoutGateway).toHaveLength(1);
		expect(withoutGateway[0].name).toBe("skill_local");
	});

	it("register() rejects names without skill_ prefix", () => {
		const registry = new SkillRegistry();
		expect(() => registry.register(makeSkill({ name: "bad_name" }))).toThrow(
			/skill_ prefix/,
		);
	});

	it("register() rejects duplicate names", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_dup" }));
		expect(() => registry.register(makeSkill({ name: "skill_dup" }))).toThrow(
			/already registered/,
		);
	});
});

describe("SkillRegistry — safety metadata", () => {
	it("defaults to fail-closed (concurrencySafe=false, destructive=false, readOnly=false)", () => {
		const registry = new SkillRegistry();
		registry.register(makeSkill({ name: "skill_plain" }));
		expect(registry.isConcurrencySafe("skill_plain", {})).toBe(false);
		expect(registry.isDestructive("skill_plain", {})).toBe(false);
		expect(registry.isReadOnly("skill_plain", {})).toBe(false);
	});

	it("returns false for unknown tool names", () => {
		const registry = new SkillRegistry();
		expect(registry.isConcurrencySafe("nonexistent", {})).toBe(false);
		expect(registry.isDestructive("nonexistent", {})).toBe(false);
		expect(registry.isReadOnly("nonexistent", {})).toBe(false);
	});

	it("respects explicit safety predicates on skills", () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				name: "skill_safe_reader",
				isConcurrencySafe: () => true,
				isDestructive: () => false,
				isReadOnly: () => true,
			}),
		);
		expect(registry.isConcurrencySafe("skill_safe_reader", {})).toBe(true);
		expect(registry.isDestructive("skill_safe_reader", {})).toBe(false);
		expect(registry.isReadOnly("skill_safe_reader", {})).toBe(true);
	});

	it("passes args to safety predicates", () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				name: "skill_conditional",
				isDestructive: (args) => args.force === true,
			}),
		);
		expect(registry.isDestructive("skill_conditional", { force: false })).toBe(
			false,
		);
		expect(registry.isDestructive("skill_conditional", { force: true })).toBe(
			true,
		);
	});

	it("registerToolSafety works for non-skill tools", () => {
		const registry = new SkillRegistry();
		registry.registerToolSafety("read_file", {
			isConcurrencySafe: () => true,
			isReadOnly: () => true,
		});
		expect(registry.isConcurrencySafe("read_file", {})).toBe(true);
		expect(registry.isReadOnly("read_file", {})).toBe(true);
		// isDestructive not provided → defaults to false
		expect(registry.isDestructive("read_file", {})).toBe(false);
	});

	it("partitionForConcurrentExecution splits correctly", () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				name: "skill_parallel",
				isConcurrencySafe: () => true,
			}),
		);
		registry.register(
			makeSkill({
				name: "skill_serial",
				// isConcurrencySafe defaults to false
			}),
		);
		registry.registerToolSafety("read_file", {
			isConcurrencySafe: () => true,
		});

		const calls = [
			{ id: "1", name: "skill_parallel", args: {} },
			{ id: "2", name: "skill_serial", args: {} },
			{ id: "3", name: "read_file", args: { path: "/tmp/x" } },
			{ id: "4", name: "unknown_tool", args: {} },
		];

		const { concurrent, sequential } =
			registry.partitionForConcurrentExecution(calls);
		expect(concurrent.map((c) => c.name)).toEqual([
			"skill_parallel",
			"read_file",
		]);
		expect(sequential.map((c) => c.name)).toEqual([
			"skill_serial",
			"unknown_tool",
		]);
	});

	it("existing skills still work after safety metadata additions", async () => {
		const registry = new SkillRegistry();
		registry.register(
			makeSkill({
				name: "skill_legacy",
				execute: async () => ({ success: true, output: "legacy works" }),
			}),
		);
		const result = await registry.execute("skill_legacy", {}, {});
		expect(result.success).toBe(true);
		expect(result.output).toBe("legacy works");
		// Safety defaults still hold
		expect(registry.isConcurrencySafe("skill_legacy", {})).toBe(false);
	});
});
