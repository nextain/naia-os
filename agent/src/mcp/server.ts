import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillRegistry } from "../skills/registry.js";

/**
 * Expose Naia skills as MCP tools via stdio transport.
 * Uses the low-level Server API to pass JSON Schema directly
 * (McpServer.tool() requires Zod schemas which we don't have).
 */
export class NaiaMcpServer {
	private server: Server;

	constructor(
		private readonly registry: SkillRegistry,
		name = "naia-agent",
		version = "0.1.0",
	) {
		this.server = new Server(
			{ name, version },
			{ capabilities: { tools: {} } },
		);
		this.registerHandlers();
	}

	private registerHandlers(): void {
		// tools/list — return all skills as MCP tools
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			const tools = this.registry.list().map((skill) => ({
				name: skill.name.startsWith("skill_")
					? skill.name.slice(6)
					: skill.name,
				description: skill.description,
				inputSchema: (skill.parameters as {
					type: string;
					properties?: Record<string, unknown>;
				}) ?? { type: "object" as const, properties: {} },
			}));
			return { tools };
		});

		// tools/call — execute a skill by name
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const mcpName = request.params.name;
			// Try with skill_ prefix first, then without
			const skillName = this.registry.has(`skill_${mcpName}`)
				? `skill_${mcpName}`
				: mcpName;

			if (!this.registry.has(skillName)) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Unknown tool: ${mcpName}`,
						},
					],
					isError: true,
				};
			}

			const result = await this.registry.execute(
				skillName,
				(request.params.arguments ?? {}) as Record<string, unknown>,
				{},
			);

			return {
				content: [{ type: "text" as const, text: result.output }],
				isError: !result.success,
			};
		});
	}

	/** Start the MCP server on stdio transport */
	async start(): Promise<void> {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
	}

	/** Connect with a custom transport (for testing with InMemoryTransport) */
	async connectTransport(transport: Parameters<Server["connect"]>[0]): Promise<void> {
		await this.server.connect(transport);
	}
}
