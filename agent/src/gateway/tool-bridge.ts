import type { ToolDefinition } from "../providers/types.js";
import type { GatewayClient } from "./client.js";
import { executeSessionsSpawn } from "./sessions-spawn.js";

export type { ToolDefinition };

/** Result from tool execution */
export interface ToolResult {
	success: boolean;
	output: string;
	error?: string;
}

/** Escape a string for safe use inside a shell single-quoted context */
function shellEscape(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Validate path has no null bytes or other dangerous characters */
function validatePath(path: string): string | null {
	if (path.includes("\0")) {
		return "Invalid path: contains null byte";
	}
	return null;
}

/** Default tools available when Gateway is connected */
export const GATEWAY_TOOLS: ToolDefinition[] = [
	{
		name: "execute_command",
		description:
			"Execute a shell command on the system. Use for installing packages, running scripts, git operations, etc.",
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "The shell command to execute",
				},
				workdir: {
					type: "string",
					description: "Working directory (optional, defaults to home)",
				},
			},
			required: ["command"],
		},
	},
	{
		name: "read_file",
		description: "Read the contents of a file at the given path.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative file path" },
			},
			required: ["path"],
		},
	},
	{
		name: "write_file",
		description: "Write content to a file, creating it if it does not exist.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path to write to" },
				content: { type: "string", description: "Content to write" },
			},
			required: ["path", "content"],
		},
	},
	{
		name: "search_files",
		description:
			"Search for files by name pattern or search file contents with a regex pattern.",
		parameters: {
			type: "object",
			properties: {
				pattern: {
					type: "string",
					description: "Glob pattern for filenames or regex for content search",
				},
				path: {
					type: "string",
					description: "Directory to search in (defaults to home)",
				},
				content: {
					type: "boolean",
					description: "If true, search file contents instead of names",
				},
			},
			required: ["pattern"],
		},
	},
	{
		name: "web_search",
		description: "Search the web for information.",
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query" },
			},
			required: ["query"],
		},
	},
	{
		name: "apply_diff",
		description:
			"Apply a search-and-replace edit to a file. Provide the exact text to find and its replacement. Use for precise, targeted file modifications.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path to edit" },
				search: {
					type: "string",
					description: "Exact text to find in the file",
				},
				replace: {
					type: "string",
					description: "Text to replace the found text with",
				},
			},
			required: ["path", "search", "replace"],
		},
	},
	{
		name: "browser",
		description:
			"Fetch and read the content of a web page. Returns the page text content (HTML stripped to readable text).",
		parameters: {
			type: "object",
			properties: {
				url: { type: "string", description: "URL of the web page to read" },
			},
			required: ["url"],
		},
	},
	{
		name: "sessions_spawn",
		description:
			"Spawn a sub-agent to handle a complex task asynchronously. The sub-agent runs in a separate session and returns its result when done. Use for tasks requiring deep analysis, multi-file exploration, or independent research.",
		parameters: {
			type: "object",
			properties: {
				task: {
					type: "string",
					description: "Description of the task for the sub-agent to perform",
				},
				label: {
					type: "string",
					description: "Short label for display (optional)",
				},
			},
			required: ["task"],
		},
	},
];

/** Blocked command patterns (Tier 3) */
const BLOCKED_PATTERNS = [
	/^rm\s+-rf\s+\//,
	/^sudo\s/,
	/^chmod\s+777/,
	/\|\s*bash$/,
	/^curl\s.*\|\s*sh/,
	/^mkfs\./,
	/^dd\s+if=/,
];

function isBlockedCommand(command: string): boolean {
	return BLOCKED_PATTERNS.some((pattern) => pattern.test(command.trim()));
}

/** Execute a tool call via the Gateway */
export async function executeTool(
	client: GatewayClient,
	toolName: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	if (!client.isConnected()) {
		return { success: false, output: "", error: "Gateway not connected" };
	}

	switch (toolName) {
		case "execute_command": {
			const command = args.command as string;
			if (isBlockedCommand(command)) {
				return {
					success: false,
					output: "",
					error: `Blocked: "${command}" is not allowed for safety reasons`,
				};
			}
			try {
				const result = (await client.request("exec.bash", {
					command,
					workdir: args.workdir || undefined,
				})) as { stdout?: string; stderr?: string; exitCode?: number };
				return {
					success: (result.exitCode ?? 0) === 0,
					output: result.stdout || result.stderr || "",
					error: result.exitCode !== 0 ? result.stderr : undefined,
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "read_file": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			try {
				const result = (await client.request("exec.bash", {
					command: `cat ${shellEscape(path)}`,
				})) as { stdout?: string; exitCode?: number };
				return {
					success: (result.exitCode ?? 0) === 0,
					output: result.stdout || "",
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "write_file": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			try {
				const escapedPath = shellEscape(path);
				const escapedContent = shellEscape(args.content as string);
				const result = (await client.request("exec.bash", {
					command: `mkdir -p "$(dirname ${escapedPath})" && printf '%s' ${escapedContent} > ${escapedPath}`,
				})) as { exitCode?: number; stderr?: string };
				return {
					success: (result.exitCode ?? 0) === 0,
					output: `File written: ${path}`,
					error: result.exitCode !== 0 ? result.stderr : undefined,
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "search_files": {
			const pattern = args.pattern as string;
			const searchPath = (args.path as string) || "~";
			const patternErr = validatePath(pattern);
			const pathErr = validatePath(searchPath);
			if (patternErr || pathErr) {
				return {
					success: false,
					output: "",
					error: patternErr || pathErr || "Invalid input",
				};
			}
			try {
				const command = args.content
					? `grep -rl ${shellEscape(pattern)} ${shellEscape(searchPath)} 2>/dev/null | head -20`
					: `find ${shellEscape(searchPath)} -name ${shellEscape(pattern)} 2>/dev/null | head -20`;
				const result = (await client.request("exec.bash", {
					command,
				})) as { stdout?: string; exitCode?: number };
				return {
					success: true,
					output: result.stdout || "No matches found",
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "web_search": {
			try {
				const result = await client.request("skills.invoke", {
					skill: "web-search",
					args: { query: args.query },
				});
				return {
					success: true,
					output: JSON.stringify(result),
				};
			} catch (err) {
				return {
					success: false,
					output: "",
					error: `Web search failed: ${String(err)}`,
				};
			}
		}

		case "apply_diff": {
			const path = args.path as string;
			const pathErr = validatePath(path);
			if (pathErr) {
				return { success: false, output: "", error: pathErr };
			}
			const search = args.search as string;
			const replace = args.replace as string;
			if (!search) {
				return {
					success: false,
					output: "",
					error: "search text cannot be empty",
				};
			}
			try {
				// Read file, replace, write back
				const readResult = (await client.request("exec.bash", {
					command: `cat ${shellEscape(path)}`,
				})) as { stdout?: string; exitCode?: number; stderr?: string };
				if ((readResult.exitCode ?? 0) !== 0) {
					return {
						success: false,
						output: "",
						error: readResult.stderr || "Failed to read file",
					};
				}
				const content = readResult.stdout || "";
				if (!content.includes(search)) {
					return {
						success: false,
						output: "",
						error: "Search text not found in file",
					};
				}
				const newContent = content.replace(search, replace);
				const escapedPath = shellEscape(path);
				const escapedContent = shellEscape(newContent);
				const writeResult = (await client.request("exec.bash", {
					command: `printf '%s' ${escapedContent} > ${escapedPath}`,
				})) as { exitCode?: number; stderr?: string };
				return {
					success: (writeResult.exitCode ?? 0) === 0,
					output: `Applied diff to ${path}`,
					error:
						writeResult.exitCode !== 0 ? writeResult.stderr : undefined,
				};
			} catch (err) {
				return { success: false, output: "", error: String(err) };
			}
		}

		case "browser": {
			const url = args.url as string;
			if (!url) {
				return { success: false, output: "", error: "URL is required" };
			}
			try {
				const result = await client.request("skills.invoke", {
					skill: "browser",
					args: { url },
				});
				return {
					success: true,
					output:
						typeof result === "string"
							? result
							: JSON.stringify(result),
				};
			} catch (err) {
				return {
					success: false,
					output: "",
					error: `Browser failed: ${String(err)}`,
				};
			}
		}

		case "sessions_spawn": {
			return executeSessionsSpawn(client, {
				task: args.task as string,
				label: args.label as string | undefined,
			});
		}

		default:
			return { success: false, output: "", error: `Unknown tool: ${toolName}` };
	}
}
