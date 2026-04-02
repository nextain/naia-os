import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Configuration for connecting to an MCP server */
export interface McpServerConfig {
	/** Display name for this MCP server */
	name: string;
	/** Command to spawn the MCP server process */
	command: string;
	/** Arguments for the server command */
	args?: string[];
	/** Environment variables for the server process */
	env?: Record<string, string>;
}

/** Discovered MCP tool (from tools/list) */
export interface McpTool {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
}

/** Result from an MCP tool call */
export interface McpToolResult {
	content: Array<{ type: string; text?: string; [key: string]: unknown }>;
	isError?: boolean;
}

/**
 * Manages a connection to a single MCP server via stdio transport.
 * Discovers tools and dispatches calls through the MCP protocol.
 */
export class McpClientConnection {
	private client: Client;
	private transport: StdioClientTransport | null = null;
	private connected = false;

	constructor(private readonly config: McpServerConfig) {
		this.client = new Client(
			{ name: "naia-agent", version: "0.1.0" },
			{ capabilities: {} },
		);
	}

	/** Connect to the MCP server and perform capability negotiation */
	async connect(): Promise<void> {
		if (this.connected) return;

		this.transport = new StdioClientTransport({
			command: this.config.command,
			args: this.config.args,
			env: {
				...process.env,
				...this.config.env,
			} as Record<string, string>,
		});

		await this.client.connect(this.transport);
		this.connected = true;

		// Track unexpected disconnections
		this.client.onclose = () => {
			this.connected = false;
		};
	}

	/** List all tools available on this MCP server */
	async listTools(): Promise<McpTool[]> {
		if (!this.connected) {
			throw new Error("MCP client not connected");
		}

		const allTools: McpTool[] = [];
		let cursor: string | undefined;
		do {
			const response = await this.client.listTools(
				cursor ? { cursor } : undefined,
			);
			for (const tool of response.tools) {
				allTools.push({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema as Record<string, unknown>,
				});
			}
			cursor = response.nextCursor;
		} while (cursor);

		return allTools;
	}

	/** Call a tool on this MCP server */
	async callTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<McpToolResult> {
		if (!this.connected) {
			throw new Error("MCP client not connected");
		}

		const result = await this.client.callTool({
			name,
			arguments: args,
		});

		return {
			content: (result.content ?? []) as McpToolResult["content"],
			isError: result.isError as boolean | undefined,
		};
	}

	/** Disconnect from the MCP server */
	async close(): Promise<void> {
		if (!this.connected) return;
		try {
			await this.client.close();
		} catch {
			// Ignore close errors
		}
		this.connected = false;
		this.transport = null;
	}

	get isConnected(): boolean {
		return this.connected;
	}

	get serverName(): string {
		return this.config.name;
	}
}
