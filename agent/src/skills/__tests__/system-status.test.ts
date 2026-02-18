import { describe, expect, it } from "vitest";
import { createSystemStatusSkill } from "../built-in/system-status.js";

const skill = createSystemStatusSkill();

describe("skill_system_status", () => {
	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_system_status");
		expect(skill.tier).toBe(0);
		expect(skill.requiresGateway).toBe(false);
		expect(skill.source).toBe("built-in");
	});

	it("returns all sections by default", async () => {
		const result = await skill.execute({}, {});
		expect(result.success).toBe(true);
		const data = JSON.parse(result.output);
		expect(data.os).toBeDefined();
		expect(data.memory).toBeDefined();
		expect(data.uptime).toBeDefined();
		expect(data.cpus).toBeDefined();
	});

	it("returns only memory section", async () => {
		const result = await skill.execute({ section: "memory" }, {});
		expect(result.success).toBe(true);
		const data = JSON.parse(result.output);
		expect(data.totalMB).toBeGreaterThan(0);
		expect(data.freeMB).toBeDefined();
	});

	it("returns only cpu section", async () => {
		const result = await skill.execute({ section: "cpu" }, {});
		expect(result.success).toBe(true);
		const data = JSON.parse(result.output);
		expect(data.count).toBeGreaterThan(0);
		expect(data.model).toBeDefined();
	});

	it("returns only os section", async () => {
		const result = await skill.execute({ section: "os" }, {});
		expect(result.success).toBe(true);
		const data = JSON.parse(result.output);
		expect(data.platform).toBeDefined();
		expect(data.hostname).toBeDefined();
	});
});
