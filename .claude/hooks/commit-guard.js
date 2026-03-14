#!/usr/bin/env node
/**
 * Commit Guard Hook (PostToolUse on Bash)
 *
 * Detects `git commit` commands and checks the progress file.
 * If current phase is before e2e_test, warns the agent.
 *
 * Phase order: issue → understand → scope → investigate → plan →
 *   build → review → e2e_test → post_test_review → sync → sync_verify → report → commit
 */

const fs = require("fs");
const path = require("path");

const PHASE_ORDER = [
	"issue",
	"understand",
	"scope",
	"investigate",
	"plan",
	"build",
	"review",
	"e2e_test",
	"post_test_review",
	"sync",
	"sync_verify",
	"report",
	"commit",
];

// Minimum phase required before git commit is safe
const MIN_PHASE_FOR_COMMIT = "sync_verify";

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
	const command = data.tool_input?.command || "";

	// Only check Bash tool with git commit commands
	if (toolName !== "Bash") {
		process.exit(0);
	}

	if (!command.match(/git\s+commit\b/)) {
		process.exit(0);
	}

	// Find progress files
	const cwd = data.cwd || process.cwd();
	const progressDir = path.join(cwd, ".agents", "progress");

	if (!fs.existsSync(progressDir)) {
		process.exit(0);
	}

	// Read the most recently modified progress file
	let latestFile = null;
	let latestMtime = 0;

	try {
		const files = fs.readdirSync(progressDir).filter((f) => f.endsWith(".json"));
		for (const file of files) {
			const filePath = path.join(progressDir, file);
			const stat = fs.statSync(filePath);
			if (stat.mtimeMs > latestMtime) {
				latestMtime = stat.mtimeMs;
				latestFile = filePath;
			}
		}
	} catch {
		process.exit(0);
	}

	if (!latestFile) {
		process.exit(0);
	}

	let progress;
	try {
		progress = JSON.parse(fs.readFileSync(latestFile, "utf8"));
	} catch {
		process.exit(0);
	}

	const currentPhase = progress.current_phase || "";
	const currentIndex = PHASE_ORDER.indexOf(currentPhase);
	const minIndex = PHASE_ORDER.indexOf(MIN_PHASE_FOR_COMMIT);

	if (currentIndex >= 0 && currentIndex < minIndex) {
		const remaining = PHASE_ORDER.slice(currentIndex + 1, minIndex + 1);
		const result = {
			reason: "",
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext:
					`[Harness] ⚠ Committing at phase "${currentPhase}" — ` +
					`phases remaining before commit: ${remaining.join(" → ")}. ` +
					`Issue: ${progress.issue || "unknown"}. ` +
					`Did you complete E2E testing and context sync?`,
			},
		};
		process.stdout.write(JSON.stringify(result));
	}

	process.exit(0);
}

main().catch(() => process.exit(0));
