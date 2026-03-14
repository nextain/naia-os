#!/usr/bin/env node
/**
 * Node.js Discovery Verification Script
 * Replicates find_node_binary() and spawn_agent_core() from lib.rs
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  Node.js Discovery Verification                     ║");
console.log("║  Replicates find_node_binary() from lib.rs           ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

// ── 1. PATH lookup (what Command::new("node").arg("-v") does) ───────────

console.log("=== 1. System PATH lookup ===");
const pathResult = spawnSync("node", ["-v"], { windowsHide: true });
if (pathResult.status === 0) {
	const version = pathResult.stdout.toString().trim();
	const major = parseInt(version.replace("v", "").split(".")[0]);
	console.log(`  ✅ Found: node ${version} (major: ${major}, need >= 22)`);
	console.log(`  ${major >= 22 ? "✅ Version OK" : "❌ Version too old"}`);
} else {
	console.log("  ❌ node not found in PATH");
	console.log("  error:", pathResult.error?.message ?? "unknown");
}

// ── 2. Well-known Windows paths (new code) ──────────────────────────────

console.log("\n=== 2. Well-known Windows paths (NEW) ===");
const wellKnown = [
	"C:\\Program Files\\nodejs\\node.exe",
	"C:\\Program Files (x86)\\nodejs\\node.exe",
];
for (const candidate of wellKnown) {
	const exists = existsSync(candidate);
	if (exists) {
		const vResult = spawnSync(candidate, ["-v"], { windowsHide: true });
		const ver = vResult.stdout?.toString().trim() ?? "?";
		console.log(`  ✅ ${candidate} → ${ver}`);
	} else {
		console.log(`  ❌ ${candidate} (not found)`);
	}
}

// ── 3. Version managers (NVM for Windows, fnm) ─────────────────────────

console.log("\n=== 3. Version managers ===");
const appdata = process.env.APPDATA ?? "";
const nvmDir = join(appdata, "nvm");
const fnmDir = join(appdata, "fnm", "node-versions");
console.log(`  NVM dir: ${nvmDir} → ${existsSync(nvmDir) ? "✅ exists" : "❌ not found"}`);
console.log(`  fnm dir: ${fnmDir} → ${existsSync(fnmDir) ? "✅ exists" : "❌ not found"}`);

// ── 4. Bundled node.exe (Tauri resources) ───────────────────────────────

console.log("\n=== 4. Bundled node.exe (Tauri resources) ===");
const naiaDir = join(HOME, "AppData", "Local", "Naia");
const bundledNode = join(naiaDir, "node.exe");
console.log(`  ${bundledNode} → ${existsSync(bundledNode) ? "✅ exists" : "❌ not found (expected — not bundled in current build)"}`);

// ── 5. Agent script location ────────────────────────────────────────────

console.log("\n=== 5. Agent script ===");
const agentScript = join(naiaDir, "agent", "dist", "index.js");
console.log(`  ${agentScript} → ${existsSync(agentScript) ? "✅ exists" : "❌ not found"}`);

// ── 6. Simulate spawn_agent_core ────────────────────────────────────────

console.log("\n=== 6. Simulate spawn_agent_core() ===");
// Find the node binary that would be used
let nodeBin = null;
if (pathResult.status === 0) {
	nodeBin = "node";
	console.log("  Using: node (from PATH)");
} else {
	for (const candidate of wellKnown) {
		if (existsSync(candidate)) {
			nodeBin = candidate;
			console.log(`  Using: ${candidate} (well-known fallback)`);
			break;
		}
	}
}

if (nodeBin && existsSync(agentScript)) {
	console.log(`  Spawning: ${nodeBin} ${agentScript} --stdio`);
	const agent = spawnSync(nodeBin, [agentScript, "--stdio"], {
		input: '{"type":"ping"}\n',
		timeout: 5000,
		windowsHide: true,
	});
	const output = agent.stdout?.toString().trim() ?? "";
	const lines = output.split("\n").filter(Boolean);
	console.log("  Agent response:");
	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			console.log(`    ${parsed.type === "ready" ? "✅" : "→"} ${line}`);
		} catch {
			console.log(`    ? ${line}`);
		}
	}
	if (lines.some((l) => l.includes('"ready"'))) {
		console.log("  ✅ Agent spawned and responded successfully!");
	} else {
		console.log("  ❌ Agent did not respond with ready");
		if (agent.stderr?.length) {
			console.log("  stderr:", agent.stderr.toString().substring(0, 300));
		}
	}
} else {
	console.log("  ❌ Cannot spawn agent:", !nodeBin ? "no node binary" : "agent script not found");
}

// ── 7. Agent homedir paths ──────────────────────────────────────────────

console.log("\n=== 7. Agent homedir() paths (modified code) ===");
const paths = {
	cronStore: `${homedir()}/.naia/cron-jobs.json`,
	skillsDir: `${homedir()}/.naia/skills`,
	memosDir: join(homedir(), ".naia", "memos"),
};
for (const [name, p] of Object.entries(paths)) {
	const valid = !p.includes("~") && p.startsWith("C:\\");
	console.log(`  ${valid ? "✅" : "❌"} ${name}: ${p}`);
}

console.log("\n══════════════════════════════════════════════════════");
console.log("Done.");
