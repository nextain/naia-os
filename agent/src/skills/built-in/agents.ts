import {
	createAgent,
	deleteAgent,
	listAgents,
	updateAgent,
} from "../../gateway/agents-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createAgentsSkill(): SkillDefinition {
	return {
		name: "skill_agents",
		description:
			"Manage Gateway agents. Actions: list, create, update, delete.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "Action: list, create, update, delete",
					enum: ["list", "create", "update", "delete"],
				},
				id: {
					type: "string",
					description:
						"Agent ID. Required for update and delete.",
				},
				name: {
					type: "string",
					description: "Agent name. Required for create.",
				},
				description: {
					type: "string",
					description: "Agent description (optional).",
				},
				model: {
					type: "string",
					description: "Model name (optional).",
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
					error: "Gateway not connected. Agent management requires a running Gateway.",
				};
			}

			switch (action) {
				case "list": {
					const result = await listAgents(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "create": {
					const name = args.name as string;
					if (!name) {
						return {
							success: false,
							output: "",
							error: "name is required for create action",
						};
					}
					const result = await createAgent(gateway, {
						name,
						description: args.description as string | undefined,
						model: args.model as string | undefined,
					});
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "update": {
					const id = args.id as string;
					if (!id) {
						return {
							success: false,
							output: "",
							error: "id is required for update action",
						};
					}
					const result = await updateAgent(gateway, id, {
						name: args.name as string | undefined,
						description: args.description as string | undefined,
						model: args.model as string | undefined,
					});
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "delete": {
					const id = args.id as string;
					if (!id) {
						return {
							success: false,
							output: "",
							error: "id is required for delete action",
						};
					}
					const result = await deleteAgent(gateway, id);
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
