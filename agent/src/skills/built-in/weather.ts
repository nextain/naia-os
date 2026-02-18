import type { SkillDefinition } from "../types.js";

export function createWeatherSkill(): SkillDefinition {
	return {
		name: "skill_weather",
		description:
			"Get current weather for a location. Requires Gateway connection.",
		parameters: {
			type: "object",
			properties: {
				location: {
					type: "string",
					description: "City or location name",
				},
			},
			required: ["location"],
		},
		tier: 1,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx) => {
			if (!ctx.gateway) {
				return {
					success: false,
					output: "",
					error: "Gateway connection required for weather skill",
				};
			}

			try {
				const payload = await ctx.gateway.request("skills.invoke", {
					skill: "weather",
					args: { location: args.location },
				});
				return {
					success: true,
					output:
						typeof payload === "string"
							? payload
							: JSON.stringify(payload),
				};
			} catch (err) {
				return {
					success: false,
					output: "",
					error: `Weather failed: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		},
	};
}
