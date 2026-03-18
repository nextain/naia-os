#!/usr/bin/env node
/**
 * Commit Guard Hook (PostToolUse on Bash)
 *
 * Detects `git commit` commands and checks the progress file.
 * Emits three kinds of advisory:
 *   1. Phase check: warns if committing before sync_verify phase
 *   2. T2 Rejected: reminds to add Rejected: trailers when rejected_alternatives are recorded
 *   3. T2 Constraint: reminds to add Constraint: trailers when constraints_discovered are recorded
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

	const warnings = [];

	if (currentIndex >= 0 && currentIndex < minIndex) {
		const remaining = PHASE_ORDER.slice(currentIndex + 1, minIndex + 1);
		warnings.push(
			`⚠ Committing at phase "${currentPhase}" — ` +
				`phases remaining before commit: ${remaining.join(" → ")}. ` +
				`Issue: ${progress.issue || "unknown"}. ` +
				`Did you complete E2E testing and context sync?`,
		);
	}

	// Gate approval check — only when phase is already past min (no duplicate phase warning)
	if (currentIndex >= minIndex) {
		const REQUIRED_GATES = ["understand", "scope", "plan", "sync"];
		const gateApprovals = progress.gate_approvals;
		if (gateApprovals && typeof gateApprovals === "object") {
			const missing = REQUIRED_GATES.filter((g) => !gateApprovals[g]);
			if (missing.length > 0) {
				warnings.push(
					`⚠ Gate approval(s) missing: ${missing.join(", ")}. ` +
						`Each gate requires explicit user confirmation before proceeding. ` +
						`Issue: ${progress.issue || "unknown"}. ` +
						`Did you get user approval at each gate (understand, scope, plan, sync)?`,
				);
			}
		}
	}

	// T2: Decision shadow advisory — remind to add Lore trailers
	const rejectedAlts = progress.rejected_alternatives;
	if (Array.isArray(rejectedAlts) && rejectedAlts.length > 0) {
		warnings.push(
			`💡 You recorded ${rejectedAlts.length} rejected alternative(s) in the progress file. ` +
				`Consider adding Rejected: trailers to the commit message so future AI sessions know what was already tried. ` +
				`Format: "Rejected: <approach> | <reason>"`,
		);
	}

	const constraints = progress.constraints_discovered;
	if (Array.isArray(constraints) && constraints.length > 0) {
		warnings.push(
			`💡 You recorded ${constraints.length} constraint(s) in the progress file. ` +
				`Consider adding Constraint: trailers to the commit message so future AI sessions know what shaped this decision. ` +
				`Format: "Constraint: <description>"`,
		);
	}

	// Upstream contribution advisory — remind to exclude .agents/ from upstream PR diff
	const upstreamIssueRef = progress.upstream_issue_ref;
	if (upstreamIssueRef) {
		warnings.push(
			`💡 Upstream contribution detected (upstream_issue_ref: ${upstreamIssueRef}). ` +
				`Before pushing: ensure .agents/ files are excluded from the upstream PR diff. ` +
				`.agents/ is your private AI config — never include it in upstream PRs.`,
		);
	}

	if (warnings.length > 0) {
		const result = {
			reason: "",
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext: warnings.map((w) => `[Harness] ${w}`).join("\n"),
			},
		};
		process.stdout.write(JSON.stringify(result));
	}

	process.exit(0);
}

main().catch(() => process.exit(0));
