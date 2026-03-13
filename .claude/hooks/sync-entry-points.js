#!/usr/bin/env node
/**
 * Entry Point Sync Hook (AGENTS.md ↔ CLAUDE.md ↔ GEMINI.md)
 *
 * Cascade rule: onEntryPointChange
 * When any of the three files is edited, copy to the other two.
 * Uses a temp lockfile to prevent infinite recursion.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

async function main() {
	let input = "";
	for await (const chunk of process.stdin) {
		input += chunk;
	}

	let data;
	try {
		data = JSON.parse(input);
	} catch {
		process.exit(0);
	}

	const toolName = data.tool_name || "";
	const filePath = data.tool_input?.file_path || data.parameters?.file_path || "";

	if (toolName !== "Edit" && toolName !== "Write") {
		process.exit(0);
	}

	const fileName = path.basename(filePath);
	const entryPoints = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"];

	if (!entryPoints.includes(fileName)) {
		process.exit(0);
	}

	// Walk up to find project root (dir containing any entry point)
	let projectRoot = path.dirname(filePath);
	while (projectRoot !== path.parse(projectRoot).root) {
		if (entryPoints.some((f) => fs.existsSync(path.join(projectRoot, f)))) {
			break;
		}
		projectRoot = path.dirname(projectRoot);
	}

	const lockFile = path.join(os.tmpdir(), ".entry-points-sync.lock");

	if (fs.existsSync(lockFile)) {
		process.exit(0);
	}

	const sourcePath = path.join(projectRoot, fileName);
	if (!fs.existsSync(sourcePath)) {
		process.exit(0);
	}

	try {
		fs.writeFileSync(lockFile, String(Date.now()));

		const targets = entryPoints.filter((f) => f !== fileName);
		const synced = [];

		for (const target of targets) {
			const targetPath = path.join(projectRoot, target);
			// Only sync if target already exists (don't create new files)
			if (fs.existsSync(targetPath)) {
				fs.copyFileSync(sourcePath, targetPath);
				synced.push(target);
			}
		}

		if (synced.length > 0) {
			// Output structured JSON for Claude Code additionalContext
			const result = {
				reason: "",
				hookSpecificOutput: {
					hookEventName: "PostToolUse",
					additionalContext: `[Harness] Synced ${fileName} → ${synced.join(", ")}`,
				},
			};
			process.stdout.write(JSON.stringify(result));
		}
	} finally {
		try {
			fs.unlinkSync(lockFile);
		} catch {
			// ignore
		}
	}

	process.exit(0);
}

main().catch(() => process.exit(0));
