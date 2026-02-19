import {
	compactSession,
	deleteSession,
	listSessions,
} from "../../gateway/sessions-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createSessionsSkill(): SkillDefinition {
	return {
		name: "skill_sessions",
		description:
			"Manage Gateway sub-agent sessions. Actions: list, delete, compact.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "Action: list, delete, compact",
					enum: ["list", "delete", "compact"],
				},
				key: {
					type: "string",
					description:
						"Session key. Required for delete and compact.",
				},
			},
			required: ["action"],
		},
		tier: 1,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. Session management requires a running Gateway.",
				};
			}

			switch (action) {
				case "list": {
					const result = await listSessions(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "delete": {
					const key = args.key as string;
					if (!key) {
						return {
							success: false,
							output: "",
							error: "key is required for delete action",
						};
					}
					const result = await deleteSession(gateway, key);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "compact": {
					const key = args.key as string;
					if (!key) {
						return {
							success: false,
							output: "",
							error: "key is required for compact action",
						};
					}
					const result = await compactSession(gateway, key);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				default:
					return {
						success: false,
						output: "",
						error: `Unknown action: ${action}`,
					};
			}
		},
	};
}
