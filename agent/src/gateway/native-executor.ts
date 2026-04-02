import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type {
	CommandExecuteOptions,
	CommandExecutor,
	CommandResult,
} from "./types.js";

/**
 * Executes shell commands directly via child_process.spawn.
 * No Gateway/RPC dependency — works standalone.
 *
 * Handles Flatpak sandbox detection: routes commands through
 * flatpak-spawn --host when running inside a Flatpak container.
 */
export class NativeCommandExecutor implements CommandExecutor {
	private readonly isFlatpak: boolean;

	constructor() {
		try {
			this.isFlatpak = existsSync("/.flatpak-info");
		} catch {
			this.isFlatpak = false;
		}
	}

	async execute(
		command: string,
		options?: CommandExecuteOptions,
	): Promise<CommandResult> {
		const { cmd, args } = this.buildSpawnArgs(command, !!options?.cwd);

		return new Promise<CommandResult>((resolve) => {
			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];

			const child = spawn(cmd, args, {
				stdio: ["pipe", "pipe", "pipe"],
				shell: false,
				cwd: options?.cwd,
			});

			// Close stdin immediately — commands should not wait for input
			child.stdin.end();

			child.stdout.on("data", (chunk: Buffer) => {
				stdoutChunks.push(chunk);
			});

			child.stderr.on("data", (chunk: Buffer) => {
				stderrChunks.push(chunk);
			});

			child.on("error", (err) => {
				resolve({
					success: false,
					output: "",
					error: err.message,
				});
			});

			child.on("close", (exitCode) => {
				const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
				const stderr = Buffer.concat(stderrChunks).toString("utf-8");
				const code = exitCode ?? 1;
				resolve({
					success: code === 0,
					output: stdout,
					error: code !== 0 ? stderr || `Exit code ${code}` : undefined,
				});
			});
		});
	}

	private buildSpawnArgs(
		command: string,
		hasCwd: boolean,
	): { cmd: string; args: string[] } {
		// Use -c (not -lc) when cwd is specified: login shell may override cwd
		const bashFlag = hasCwd ? "-c" : "-lc";
		if (this.isFlatpak) {
			return {
				cmd: "flatpak-spawn",
				args: ["--host", "bash", bashFlag, command],
			};
		}
		return {
			cmd: "bash",
			args: [bashFlag, command],
		};
	}
}
