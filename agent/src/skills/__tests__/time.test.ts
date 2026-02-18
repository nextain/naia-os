import { describe, expect, it } from "vitest";
import { createTimeSkill } from "../built-in/time.js";

const skill = createTimeSkill();

describe("skill_time", () => {
	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_time");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("returns locale format by default", async () => {
		const result = await skill.execute({}, {});
		expect(result.success).toBe(true);
		// Should contain date-like string
		expect(result.output.length).toBeGreaterThan(5);
	});

	it("returns iso format", async () => {
		const result = await skill.execute({ format: "iso" }, {});
		expect(result.success).toBe(true);
		// ISO 8601 pattern
		expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("returns unix timestamp", async () => {
		const result = await skill.execute({ format: "unix" }, {});
		expect(result.success).toBe(true);
		const ts = Number(result.output);
		expect(ts).toBeGreaterThan(1_700_000_000);
	});

	it("respects timezone parameter", async () => {
		const result = await skill.execute(
			{ format: "iso", timezone: "Asia/Seoul" },
			{},
		);
		expect(result.success).toBe(true);
		expect(result.output).toMatch(/\+09:00$/);
	});
});
