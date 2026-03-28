#!/usr/bin/env node
/**
 * Cross-Review JSONL Event Log Parser
 *
 * Reads a review event log and outputs metrics:
 * - Rounds to convergence
 * - Findings: confirmed, dismissed, contested
 * - Per-reviewer: findings raised, confirmed, dismissed
 * - Final status
 *
 * Usage: node .agents/tests/parse-review-log.js .agents/reviews/cr-YYYYMMDD-HHmm.jsonl
 */

const fs = require("fs");
const path = require("path");

const logFile = process.argv[2];
if (!logFile) {
	console.error("Usage: node parse-review-log.js <path-to-jsonl>");
	process.exit(1);
}

if (!fs.existsSync(logFile)) {
	console.error(`File not found: ${logFile}`);
	process.exit(1);
}

const lines = fs
	.readFileSync(logFile, "utf8")
	.split("\n")
	.filter((l) => l.trim());
const events = lines.map((l) => {
	try {
		return JSON.parse(l);
	} catch {
		return null;
	}
}).filter(Boolean);

// Metrics
const metrics = {
	review_id: null,
	profile: null,
	target: null,
	total_rounds: 0,
	final_status: null,
	reviewers: {},
	findings: {
		confirmed: 0,
		dismissed: 0,
		contested: 0,
	},
	rounds: [],
};

for (const e of events) {
	switch (e.type) {
		case "REVIEW_STARTED":
			metrics.review_id = e.review_id;
			metrics.profile = e.profile;
			metrics.target = e.target;
			break;

		case "REVIEWER_SPAWNED":
			metrics.reviewers[e.reviewer_id] = {
				expertise: e.expertise,
				model: e.model,
				findings_raised: 0,
				findings_confirmed: 0,
			};
			break;

		case "REPORT_SUBMITTED":
			if (metrics.reviewers[e.reviewer_id]) {
				metrics.reviewers[e.reviewer_id].findings_raised += e.findings_count || 0;
			}
			break;

		case "FINDING_RAISED":
			// Track individual finding details (severity, file, line)
			if (e.reviewer_id && metrics.reviewers[e.reviewer_id]) {
				metrics.reviewers[e.reviewer_id].findings_raised++;
			}
			break;

		case "VOTE_CAST":
			// Track individual votes for audit
			break;

		case "FINDING_CONFIRMED":
			metrics.findings.confirmed++;
			if (e.supporters) {
				for (const s of e.supporters) {
					if (metrics.reviewers[s]) {
						metrics.reviewers[s].findings_confirmed++;
					}
				}
			}
			break;

		case "FINDING_DISMISSED":
			metrics.findings.dismissed++;
			break;

		case "FINDING_CONTESTED":
			metrics.findings.contested++;
			break;

		case "ROUND_COMPLETED":
			if (typeof e.round === "number") {
				metrics.total_rounds = Math.max(metrics.total_rounds, e.round);
			}
			metrics.rounds.push({
				round: e.round,
				confirmed: e.confirmed,
				dismissed: e.dismissed,
				contested: e.contested,
				clean_count: e.clean_count,
			});
			break;

		case "REVIEW_COMPLETED":
			metrics.final_status = e.final_status;
			metrics.total_rounds = e.rounds_total || metrics.total_rounds;
			break;
	}
}

// Output
console.log("=== Cross-Review Metrics ===");
console.log(`Review ID:    ${metrics.review_id}`);
console.log(`Profile:      ${metrics.profile}`);
console.log(`Target:       ${metrics.target}`);
console.log(`Total Rounds: ${metrics.total_rounds}`);
console.log(`Final Status: ${metrics.final_status || "in_progress"}`);
console.log("");

console.log("--- Findings ---");
console.log(`Confirmed:  ${metrics.findings.confirmed}`);
console.log(`Dismissed:  ${metrics.findings.dismissed}`);
console.log(`Contested:  ${metrics.findings.contested}`);
console.log("");

console.log("--- Per-Reviewer ---");
for (const [id, r] of Object.entries(metrics.reviewers)) {
	console.log(
		`${id} (${r.expertise}): raised=${r.findings_raised} confirmed=${r.findings_confirmed}`,
	);
}
console.log("");

console.log("--- Round History ---");
for (const r of metrics.rounds) {
	console.log(
		`Round ${r.round}: confirmed=${r.confirmed} dismissed=${r.dismissed} contested=${r.contested} clean_count=${r.clean_count}`,
	);
}

// Machine-readable JSON output
if (process.argv.includes("--json")) {
	console.log("\n--- JSON ---");
	console.log(JSON.stringify(metrics, null, 2));
}
