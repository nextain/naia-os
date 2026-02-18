import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../../gateway/client.js";
import {
	createMockGateway,
	type MockGateway,
} from "../../gateway/__tests__/mock-gateway.js";
import { createWeatherSkill } from "../built-in/weather.js";

const skill = createWeatherSkill();

describe("skill_weather", () => {
	it("has correct metadata", () => {
		expect(skill.name).toBe("skill_weather");
		expect(skill.tier).toBe(1);
		expect(skill.requiresGateway).toBe(true);
		expect(skill.source).toBe("built-in");
	});

	it("returns weather via gateway skills.invoke", async () => {
		const mock = createMockGateway((method, params, respond) => {
			if (method === "skills.invoke") {
				const p = params as { skill: string; args: Record<string, unknown> };
				expect(p.skill).toBe("weather");
				respond.ok({ temperature: "22°C", condition: "sunny" });
				return;
			}
			respond.error("UNKNOWN", `unknown method: ${method}`);
		});

		const client = new GatewayClient();
		try {
			await client.connect(`ws://127.0.0.1:${mock.port}`, {
				token: "test-token",
			});
			const result = await skill.execute(
				{ location: "Seoul" },
				{ gateway: client },
			);
			expect(result.success).toBe(true);
			expect(result.output).toContain("22°C");
		} finally {
			client.close();
			mock.close();
		}
	});

	it("returns error when gateway is not provided", async () => {
		const result = await skill.execute({ location: "Seoul" }, {});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Gateway");
	});

	it("returns error when gateway RPC fails", async () => {
		const mock = createMockGateway((method, _params, respond) => {
			respond.error("INTERNAL", "weather service down");
		});

		const client = new GatewayClient();
		try {
			await client.connect(`ws://127.0.0.1:${mock.port}`, {
				token: "test-token",
			});
			const result = await skill.execute(
				{ location: "Seoul" },
				{ gateway: client },
			);
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		} finally {
			client.close();
			mock.close();
		}
	});
});
