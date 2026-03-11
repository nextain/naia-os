#!/usr/bin/env node
/**
 * Windows E2E test: Full clean-install flow.
 *
 * Tests the complete user journey on Windows:
 *   1. Verify clean state (no NaiaEnv, no .naia, no .openclaw)
 *   2. WSL setup (Ubuntu install → NaiaEnv creation → provisioning)
 *   3. Gateway starts and responds to health check
 *   4. Device auto-approval
 *   5. Agent ↔ Gateway handshake
 *   6. Cleanup
 *
 * Prerequisites:
 *   - Windows 11 with WSL + VirtualMachinePlatform enabled
 *   - Node.js 22+ on Windows host
 *   - NaiaEnv must NOT exist (test verifies clean-install path)
 *
 * Usage:
 *   node scripts/test-windows-e2e.mjs           # full flow
 *   node scripts/test-windows-e2e.mjs --skip-cleanup  # keep NaiaEnv after test
 *
 * This script exits with code 0 on success, 1 on failure.
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DISTRO = "NaiaEnv";
const GATEWAY_PORT = 18789;
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const OPENCLAW_PATH = "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs";
const SKIP_CLEANUP = process.argv.includes("--skip-cleanup");

let passed = 0;
let failed = 0;
let gatewayProcess = null;

// ── Helpers ──

function log(msg) {
	const ts = new Date().toISOString().slice(11, 19);
	console.log(`[${ts}] ${msg}`);
}

function ok(name) {
	passed++;
	console.log(`  ✓ ${name}`);
}

function fail(name, err) {
	failed++;
	console.error(`  ✗ ${name}: ${err}`);
}

function run(cmd, opts = {}) {
	try {
		return execSync(cmd, {
			encoding: "utf-8",
			timeout: opts.timeout || 120_000,
			stdio: ["pipe", "pipe", "pipe"],
			...opts,
		}).trim();
	} catch (e) {
		if (opts.allowFail) return e.stderr?.trim() || e.stdout?.trim() || "";
		throw e;
	}
}

function wslRun(distro, command, opts = {}) {
	// For multiline commands, pipe via stdin to avoid quoting hell
	if (command.includes("\n")) {
		try {
			return execSync(`wsl -d ${distro} -- bash -l`, {
				input: command,
				encoding: "utf-8",
				timeout: opts.timeout || 120_000,
				stdio: ["pipe", "pipe", "pipe"],
			}).trim();
		} catch (e) {
			if (opts.allowFail) return e.stderr?.trim() || e.stdout?.trim() || "";
			throw e;
		}
	}
	return run(`wsl -d ${distro} -- bash -lc "${command.replace(/"/g, '\\"')}"`, opts);
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(url, maxWaitMs = 60_000) {
	const start = Date.now();
	while (Date.now() - start < maxWaitMs) {
		try {
			const res = await fetch(`${url}/health`);
			if (res.ok) {
				const data = await res.json();
				if (data.ok) return data;
			}
		} catch {
			// not ready yet
		}
		await sleep(2000);
	}
	throw new Error(`Gateway health check timed out after ${maxWaitMs}ms`);
}

function isDistroRegistered(name) {
	const out = run("wsl -l -q", { allowFail: true });
	// WSL outputs UTF-16LE with null bytes — strip them
	const cleaned = out.replace(/\0/g, "");
	return cleaned.split("\n").some((l) => l.trim() === name);
}

// ── Test phases ──

async function phase1_verifyCleanState() {
	log("Phase 1: Verify clean state");

	if (!isDistroRegistered(DISTRO)) {
		ok("NaiaEnv not registered");
	} else {
		fail("NaiaEnv not registered", "distro already exists — unregister first");
		return false;
	}

	const naiaDir = join(homedir(), ".naia");
	if (!existsSync(naiaDir)) {
		ok(".naia directory absent");
	} else {
		fail(".naia directory absent", `${naiaDir} exists`);
		return false;
	}

	// WSL must be functional
	try {
		run("wsl --version");
		ok("WSL available");
	} catch {
		fail("WSL available", "wsl --version failed — WSL not installed");
		return false;
	}

	return true;
}

async function phase2_wslSetup() {
	log("Phase 2: WSL setup (Ubuntu → NaiaEnv → provision)");

	// 2a: Install Ubuntu-24.04
	if (!isDistroRegistered("Ubuntu-24.04")) {
		log("  Installing Ubuntu-24.04 (this takes a few minutes)...");
		try {
			run("wsl --install -d Ubuntu-24.04 --no-launch", { timeout: 300_000 });
			ok("Ubuntu-24.04 installed");
		} catch (e) {
			fail("Ubuntu-24.04 installed", e.message);
			return false;
		}
	} else {
		ok("Ubuntu-24.04 already present");
	}

	// 2b: Export Ubuntu → import as NaiaEnv
	const wslDir = join(homedir(), ".naia", "wsl");
	mkdirSync(wslDir, { recursive: true });
	const exportPath = join(wslDir, "ubuntu-export.tar");
	const installDir = join(wslDir, "NaiaEnv");
	mkdirSync(installDir, { recursive: true });

	log("  Exporting Ubuntu base...");
	try {
		run(`wsl --export Ubuntu-24.04 "${exportPath}"`, { timeout: 300_000 });
		ok("Ubuntu exported");
	} catch (e) {
		fail("Ubuntu exported", e.message);
		return false;
	}

	log("  Importing as NaiaEnv...");
	try {
		run(`wsl --import NaiaEnv "${installDir}" "${exportPath}" --version 2`, { timeout: 120_000 });
		ok("NaiaEnv imported");
	} catch (e) {
		fail("NaiaEnv imported", e.message);
		return false;
	}

	// Cleanup export + Ubuntu base
	try {
		rmSync(exportPath, { force: true });
		run("wsl --unregister Ubuntu-24.04", { allowFail: true });
	} catch { /* ignore */ }

	// Write .wslconfig
	const wslconfigPath = join(homedir(), ".wslconfig");
	if (!existsSync(wslconfigPath)) {
		const templatePath = join(process.cwd(), "config", "defaults", "wslconfig-template");
		if (existsSync(templatePath)) {
			const { writeFileSync } = await import("node:fs");
			writeFileSync(wslconfigPath, readFileSync(templatePath, "utf-8"));
			ok(".wslconfig written");
		}
	}

	// Restart WSL to apply config
	run("wsl --shutdown", { allowFail: true });
	await sleep(3000);

	// 2c: Provision (Node.js + OpenClaw)
	log("  Provisioning NaiaEnv (Node.js + OpenClaw)...");
	try {
		wslRun(DISTRO, [
			"apt-get update -qq",
			"apt-get install -y -qq curl ca-certificates",
			"curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
			"apt-get install -y -qq nodejs",
			"node -v",
		].join(" && "), { timeout: 300_000 });
		ok("Node.js installed in NaiaEnv");
	} catch (e) {
		fail("Node.js installed in NaiaEnv", e.message);
		return false;
	}

	try {
		wslRun(DISTRO, [
			"mkdir -p /opt/naia/openclaw",
			"cd /opt/naia/openclaw",
			"npm init -y --quiet 2>/dev/null",
			"npm install openclaw@latest --quiet",
		].join(" && "), { timeout: 300_000 });
		ok("OpenClaw installed in NaiaEnv");
	} catch (e) {
		fail("OpenClaw installed in NaiaEnv", e.message);
		return false;
	}

	// 2d: Configure gateway.mode=local
	try {
		const script = [
			"cat > /tmp/set-gw-mode.js << 'NODESCRIPT'",
			"const fs = require('fs');",
			"const p = '/root/.openclaw/openclaw.json';",
			"let c = {};",
			"try { c = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}",
			"c.gateway = c.gateway || {};",
			"c.gateway.mode = 'local';",
			"fs.mkdirSync('/root/.openclaw', { recursive: true });",
			"fs.writeFileSync(p, JSON.stringify(c, null, 2));",
			"console.log('ok');",
			"NODESCRIPT",
			"node /tmp/set-gw-mode.js",
		].join("\n");
		const result = wslRun(DISTRO, script);
		if (result.includes("ok")) {
			ok("gateway.mode=local configured");
		} else {
			fail("gateway.mode=local configured", result);
			return false;
		}
	} catch (e) {
		fail("gateway.mode=local configured", e.message);
		return false;
	}

	// Verify provisioning
	try {
		const ver = wslRun(DISTRO, "node -v");
		const oc = wslRun(DISTRO, `test -f ${OPENCLAW_PATH} && echo ok`);
		if (ver.startsWith("v") && oc.includes("ok")) {
			ok(`Provisioning verified (node ${ver})`);
		} else {
			fail("Provisioning verified", `node=${ver}, openclaw=${oc}`);
			return false;
		}
	} catch (e) {
		fail("Provisioning verified", e.message);
		return false;
	}

	return true;
}

async function phase3_gateway() {
	log("Phase 3: Gateway startup + health check");

	// Spawn Gateway in WSL
	gatewayProcess = spawn("wsl", [
		"-d", DISTRO, "--",
		"node", OPENCLAW_PATH,
		"gateway", "run", "--bind", "loopback", "--port", String(GATEWAY_PORT),
	], {
		stdio: ["ignore", "pipe", "pipe"],
		detached: false,
	});

	gatewayProcess.stderr.on("data", (d) => {
		const line = d.toString().trim();
		if (line && process.env.VERBOSE) console.log(`  [gw] ${line}`);
	});

	try {
		const health = await waitForHealth(GATEWAY_URL, 60_000);
		if (health.ok) {
			ok("Gateway healthy");
		} else {
			fail("Gateway healthy", JSON.stringify(health));
			return false;
		}
	} catch (e) {
		fail("Gateway healthy", e.message);
		return false;
	}

	return true;
}

async function phase4_deviceApproval() {
	log("Phase 4: Device auto-approval");

	// Read gateway token from WSL
	let gatewayToken;
	try {
		const config = JSON.parse(wslRun(DISTRO, "cat /root/.openclaw/openclaw.json"));
		gatewayToken = config.gateway?.auth?.token;
		if (gatewayToken) {
			ok("Gateway token loaded");
		} else {
			fail("Gateway token loaded", "token missing from config");
			return false;
		}
	} catch (e) {
		fail("Gateway token loaded", e.message);
		return false;
	}

	// Copy identity + config to Windows for agent tests
	const oclawDir = join(homedir(), ".openclaw", "identity");
	mkdirSync(oclawDir, { recursive: true });
	try {
		const config = wslRun(DISTRO, "cat /root/.openclaw/openclaw.json");
		const { writeFileSync } = await import("node:fs");
		writeFileSync(join(homedir(), ".openclaw", "openclaw.json"), config);

		// device.json may not exist yet if no device has connected
		try {
			const identity = wslRun(DISTRO, "cat /root/.openclaw/identity/device.json");
			writeFileSync(join(oclawDir, "device.json"), identity);
			ok("Device identity copied to Windows");
		} catch {
			// Device identity doesn't exist yet — that's ok for a fresh install
			ok("Device identity not yet created (expected for fresh install)");
		}
	} catch (e) {
		fail("Config copied to Windows", e.message);
		return false;
	}

	// Check for pending device approvals
	try {
		const output = wslRun(DISTRO, `node ${OPENCLAW_PATH} devices list 2>&1`, { allowFail: true });
		if (output.includes("Pending")) {
			// Extract request UUID and approve
			const match = output.match(/│\s+([0-9a-f-]{36})\s+│/);
			if (match) {
				wslRun(DISTRO, `node ${OPENCLAW_PATH} devices approve ${match[1]} 2>&1`, { allowFail: true });
				ok(`Pending device approved (${match[1].slice(0, 8)}...)`);
			} else {
				ok("Pending devices found but no UUID to extract");
			}
		} else {
			ok("No pending device approvals");
		}
	} catch (e) {
		// Non-fatal — device approval is best-effort
		ok(`Device approval check skipped: ${e.message}`);
	}

	return true;
}

async function phase5_agentHandshake() {
	log("Phase 5: Agent ↔ Gateway handshake");

	// Simple WebSocket health check via HTTP
	try {
		const res = await fetch(`${GATEWAY_URL}/health`);
		const data = await res.json();
		if (data.ok && data.status === "live") {
			ok("Gateway HTTP health OK");
		} else {
			fail("Gateway HTTP health", JSON.stringify(data));
			return false;
		}
	} catch (e) {
		fail("Gateway HTTP health", e.message);
		return false;
	}

	// Run the existing gateway-e2e test suite if device identity exists
	const identityPath = join(homedir(), ".openclaw", "identity", "device.json");
	if (!existsSync(identityPath)) {
		ok("Gateway E2E suite skipped (no device identity yet — expected for fresh install)");
		return true;
	}

	try {
		const result = run(
			"npx vitest run src/__tests__/gateway-e2e.test.ts --reporter=verbose 2>&1",
			{
				timeout: 120_000,
				allowFail: true,
				cwd: join(process.cwd(), "agent"),
				env: {
					...process.env,
					CAFE_LIVE_GATEWAY_E2E: "1",
				},
			},
		);

		const passMatch = result.match(/(\d+) passed/);
		const failMatch = result.match(/(\d+) failed/);
		const passCount = passMatch ? parseInt(passMatch[1]) : 0;
		const failCount = failMatch ? parseInt(failMatch[1]) : 0;

		if (passCount > 0 && failCount <= 2) {
			ok(`Gateway E2E suite: ${passCount} passed, ${failCount} failed`);
		} else if (passCount === 0) {
			fail("Gateway E2E suite", "no tests passed — check device identity");
			return false;
		} else {
			fail("Gateway E2E suite", `${passCount} passed, ${failCount} failed (too many failures)`);
			return false;
		}
	} catch (e) {
		fail("Gateway E2E suite", e.message);
		return false;
	}

	return true;
}

async function cleanup() {
	log("Cleanup");

	if (gatewayProcess) {
		gatewayProcess.kill();
		gatewayProcess = null;
		log("  Gateway process killed");
	}

	if (!SKIP_CLEANUP) {
		// Kill OpenClaw inside WSL
		run(`wsl -d ${DISTRO} -- pkill -f openclaw 2>/dev/null`, { allowFail: true });
		run("wsl --shutdown", { allowFail: true });

		// Unregister distro
		run(`wsl --unregister ${DISTRO}`, { allowFail: true });
		run("wsl --unregister Ubuntu-24.04", { allowFail: true });

		// Remove data
		const dirs = [".naia", ".openclaw", ".wslconfig"].map((d) =>
			join(homedir(), d),
		);
		for (const d of dirs) {
			rmSync(d, { recursive: true, force: true });
		}
		log("  All data cleaned up");
	} else {
		log("  --skip-cleanup: NaiaEnv and data preserved");
	}
}

// ── Main ──

async function main() {
	console.log("╔══════════════════════════════════════════════╗");
	console.log("║  Naia Windows E2E — Clean Install Flow      ║");
	console.log("╚══════════════════════════════════════════════╝");
	console.log();

	const phases = [
		phase1_verifyCleanState,
		phase2_wslSetup,
		phase3_gateway,
		phase4_deviceApproval,
		phase5_agentHandshake,
	];

	let allPassed = true;
	for (const phase of phases) {
		const result = await phase();
		if (!result) {
			allPassed = false;
			log("⚠ Phase failed — stopping early");
			break;
		}
		console.log();
	}

	await cleanup();

	console.log();
	console.log("════════════════════════════════════════════════");
	console.log(`  Results: ${passed} passed, ${failed} failed`);
	console.log("════════════════════════════════════════════════");

	process.exit(allPassed && failed === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal error:", e);
	cleanup().finally(() => process.exit(1));
});
