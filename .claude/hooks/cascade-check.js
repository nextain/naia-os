#!/usr/bin/env node
/**
 * Cascade Rule Check Hook (PostToolUse on Edit|Write)
 *
 * Detects edits to context files and reminds agent to update mirrors.
 * Based on project-index.yaml mirror_pairs and triple-mirror structure.
 *
 * Pattern: .agents/context/*.yaml edited → remind .users/context/*.md + .users/context/ko/*.md
 */

const fs = require("fs");
const path = require("path");

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

	const reminders = [];

	// Normalize path for matching
	const normalized = filePath.replace(/\\/g, "/");

	// Pattern 1: .agents/context/*.yaml or .agents/context/*.json → remind .users/ mirrors
	const agentsMatch = normalized.match(/\.agents\/context\/([^/]+)\.(yaml|json)$/);
	if (agentsMatch) {
		const baseName = agentsMatch[1];
		const usersEn = `.users/context/${baseName}.md`;
		const usersKo = `.users/context/ko/${baseName}.md`;
		reminders.push(
			`[Harness] You edited .agents/context/${baseName}.${agentsMatch[2]}. ` +
				`Triple-mirror rule: also update ${usersEn} and ${usersKo} if they exist.`,
		);
	}

	// Pattern 2: .users/context/*.md (not in ko/) → remind .agents/ and .users/context/ko/
	const usersEnMatch = normalized.match(/\.users\/context\/([^/]+)\.md$/);
	if (usersEnMatch && !normalized.includes("/ko/")) {
		const baseName = usersEnMatch[1];
		reminders.push(
			`[Harness] You edited .users/context/${baseName}.md. ` +
				`Triple-mirror rule: also update .agents/context/${baseName}.yaml (or .json) and .users/context/ko/${baseName}.md if they exist.`,
		);
	}

	// Pattern 3: .users/context/ko/*.md → remind .agents/ and .users/context/
	const usersKoMatch = normalized.match(/\.users\/context\/ko\/([^/]+)\.md$/);
	if (usersKoMatch) {
		const baseName = usersKoMatch[1];
		reminders.push(
			`[Harness] You edited .users/context/ko/${baseName}.md. ` +
				`Triple-mirror rule: also update .agents/context/${baseName}.yaml (or .json) and .users/context/${baseName}.md if they exist.`,
		);
	}

	// Pattern 4: agents-rules.json specifically → strongest reminder (SoT)
	if (normalized.endsWith("agents-rules.json")) {
		reminders.push(
			"[Harness] agents-rules.json is the SoT. " +
				"You MUST update .users/context/agents-rules.md and .users/context/ko/agents-rules.md to match.",
		);
	}

	if (reminders.length > 0) {
		const result = {
			reason: "",
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext: reminders.join("\n"),
			},
		};
		process.stdout.write(JSON.stringify(result));
	}

	process.exit(0);
}

main().catch(() => process.exit(0));
