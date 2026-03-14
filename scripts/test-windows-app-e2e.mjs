#!/usr/bin/env node
/**
 * Windows App E2E: Launch built naia-shell.exe and verify Gateway connectivity.
 *
 * Tests the actual app binary — not manual script setup.
 * The app itself spawns the Gateway in WSL and connects.
 *
 * Prerequisites:
 *   - Built naia-shell.exe at shell/src-tauri/target/release/naia-shell.exe
 *   - NaiaEnv distro registered with Node.js + OpenClaw provisioned
 *   - WSL features enabled (VirtualMachinePlatform + WSL)
 *
 * What this tests:
 *   1. App launches successfully
 *   2. App detects NaiaEnv → spawns Gateway in WSL
 *   3. Gateway health check passes from Windows host (localhost forwarding)
 *   4. The exact endpoint the app uses: http://127.0.0.1:18789/__openclaw__/canvas/
 *   5. WebSocket chain: agent-core → Gateway via skill_diagnostics probe (CAFE_DEBUG_E2E=1)
 *
 * Usage:
 *   node scripts/test-windows-app-e2e.mjs
 *   node scripts/test-windows-app-e2e.mjs --skip-cleanup
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const GATEWAY_PORT = 18789;
const GATEWAY_HEALTH_URL = `http://127.0.0.1:${GATEWAY_PORT}/__openclaw__/canvas/`;
const GATEWAY_HEALTH_URL_ALT = `http://127.0.0.1:${GATEWAY_PORT}/health`;
const APP_BINARY = resolve(import.meta.dirname, "../shell/src-tauri/target/release/naia-shell.exe");
const MAX_WAIT_MS = 120_000; // 2 minutes for app to start + gateway to become healthy
const SKIP_CLEANUP = process.argv.includes("--skip-cleanup");

let appProcess = null;
let passed = 0;
let failed = 0;

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

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Phase 1: Precondition checks ──

function checkPreconditions() {
	log("Phase 1: Preconditions");

	// Check binary exists
	if (existsSync(APP_BINARY)) {
		ok(`App binary exists: ${APP_BINARY}`);
	} else {
		fail("App binary exists", `Not found: ${APP_BINARY}`);
		return false;
	}

	// Check NaiaEnv registered
	try {
		const out = execSync("wsl -l -q", { encoding: "utf-8" }).replace(/\0/g, "");
		if (out.split("\n").some((l) => l.trim() === "NaiaEnv")) {
			ok("NaiaEnv distro registered");
		} else {
			fail("NaiaEnv distro registered", "Not found — run test-windows-e2e.mjs first");
			return false;
		}
	} catch (e) {
		fail("NaiaEnv distro registered", e.message);
		return false;
	}

	// Check vmcompute service
	try {
		const sc = execSync("sc.exe query vmcompute", { encoding: "utf-8" });
		if (sc.includes("RUNNING")) {
			ok("HCS (vmcompute) service available");
		} else {
			fail("HCS (vmcompute) service", "Not running");
			return false;
		}
	} catch {
		fail("HCS (vmcompute) service", "sc.exe query failed");
		return false;
	}

	// Kill any existing naia-shell or gateway processes
	try {
		execSync("taskkill /F /IM naia-shell.exe 2>NUL", { stdio: "ignore" });
	} catch { /* ignore */ }
	try {
		execSync("wsl -d NaiaEnv -- pkill -f openclaw 2>/dev/null", { stdio: "ignore" });
	} catch { /* ignore */ }

	return true;
}

// ── Phase 2: Launch app ──

function launchApp() {
	log("Phase 2: Launch naia-shell.exe");

	appProcess = spawn(APP_BINARY, [], {
		stdio: ["ignore", "pipe", "pipe"],
		detached: false,
		env: { ...process.env, CAFE_DEBUG_E2E: "1" },
	});

	let appStdout = "";
	let appStderr = "";

	appProcess.stdout.on("data", (d) => {
		const line = d.toString();
		appStdout += line;
		if (process.env.VERBOSE) process.stdout.write(`[app] ${line}`);
	});

	appProcess.stderr.on("data", (d) => {
		const line = d.toString();
		appStderr += line;
		if (process.env.VERBOSE) process.stderr.write(`[app:err] ${line}`);
	});

	appProcess.on("exit", (code) => {
		log(`  App exited with code ${code}`);
	});

	// Give app a moment to start
	ok("App process spawned");
	return { appStdout: () => appStdout, appStderr: () => appStderr };
}

// ── Phase 3: Wait for Gateway health ──

async function waitForGateway() {
	log("Phase 3: Wait for Gateway health (max 120s)");

	const start = Date.now();
	let lastError = "";

	while (Date.now() - start < MAX_WAIT_MS) {
		const elapsed = Math.round((Date.now() - start) / 1000);

		// Try the exact endpoint the app uses
		try {
			const res = await fetch(GATEWAY_HEALTH_URL, {
				signal: AbortSignal.timeout(3000),
			});
			if (res.ok) {
				ok(`Gateway health OK via /__openclaw__/canvas/ (after ${elapsed}s)`);
				return true;
			}
			lastError = `HTTP ${res.status}`;
		} catch (e) {
			lastError = e.message || String(e);
		}

		// Also try /health endpoint
		try {
			const res = await fetch(GATEWAY_HEALTH_URL_ALT, {
				signal: AbortSignal.timeout(3000),
			});
			if (res.ok) {
				const data = await res.json().catch(() => ({}));
				if (data.ok) {
					ok(`Gateway health OK via /health (after ${elapsed}s)`);
					return true;
				}
			}
		} catch { /* ignore */ }

		if (elapsed % 10 === 0 && elapsed > 0) {
			log(`  Still waiting... (${elapsed}s, last error: ${lastError})`);
		}

		await sleep(2000);
	}

	fail("Gateway health", `Timed out after ${MAX_WAIT_MS / 1000}s — last error: ${lastError}`);
	return false;
}

// ── Phase 4: Verify Gateway functionality + App internal state ──

async function verifyGateway() {
	log("Phase 4: Verify Gateway functionality + app internal state");

	// 4a: Check /health endpoint details
	try {
		const res = await fetch(GATEWAY_HEALTH_URL_ALT, {
			signal: AbortSignal.timeout(5000),
		});
		if (res.ok) {
			const data = await res.json();
			ok(`Gateway status: ${data.status || "unknown"}, ok: ${data.ok}`);
		} else {
			fail("Gateway /health", `HTTP ${res.status}`);
			return false;
		}
	} catch (e) {
		fail("Gateway /health", e.message);
		return false;
	}

	// 4b: Verify WSL process is running
	try {
		const ps = execSync('wsl -d NaiaEnv -- bash -c "ps aux | grep openclaw-gateway | grep -v grep"', {
			encoding: "utf-8",
			timeout: 10_000,
		});
		if (ps.includes("openclaw-gateway")) {
			ok("Gateway process running in WSL");
		} else {
			fail("Gateway process running in WSL", "process not found");
			return false;
		}
	} catch (e) {
		fail("Gateway process running in WSL", e.message);
		return false;
	}

	// 4c: Verify app's internal logs confirm Gateway connection
	const logPath = resolve(homedir(), ".naia/logs/naia.log");
	if (existsSync(logPath)) {
		const logContent = readFileSync(logPath, "utf-8");
		const hasGatewayReady = logContent.includes("Gateway ready") || logContent.includes("WSL Gateway healthy");
		const hasHealthMonitor = logContent.includes("Health monitor started") || logContent.includes("health monitor");
		const hasNodeHost = logContent.includes("Node Host spawned");

		if (hasGatewayReady) {
			ok("App log confirms: Gateway ready");
		} else {
			fail("App log: Gateway ready", "not found in naia.log");
		}

		if (hasHealthMonitor) {
			ok("App log confirms: Health monitor active");
		} else {
			log("  ⚠ Health monitor not mentioned in log (may be expected if started at setup)");
		}

		if (hasNodeHost) {
			ok("App log confirms: Node Host spawned");
		} else {
			log("  ⚠ Node Host not spawned (may be expected — requires Gateway healthy first)");
		}
	} else {
		fail("App log file", `Not found: ${logPath}`);
	}

	// 4d: Verify Gateway serves skills (same check as frontend diagnostics tab)
	// This is what the UI uses: fetch skills via /__openclaw__/canvas/ + WebSocket
	try {
		const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/__openclaw__/canvas/`, {
			signal: AbortSignal.timeout(5000),
		});
		if (res.ok) {
			const text = await res.text();
			ok(`Gateway canvas endpoint responds (${text.length} bytes)`);
		} else {
			fail("Gateway canvas endpoint", `HTTP ${res.status}`);
		}
	} catch (e) {
		fail("Gateway canvas endpoint", e.message);
	}

	// 4e: Verify Gateway details logged by app (version, methods count)
	if (existsSync(logPath)) {
		const logContent2 = readFileSync(logPath, "utf-8");
		const detailsMatch = logContent2.match(/Gateway details: ok=(\w+), version=([^,]+), methods=(\d+)/);
		if (detailsMatch) {
			const [, gwOk, gwVersion, gwMethods] = detailsMatch;
			ok(`Gateway details: ok=${gwOk}, version=${gwVersion}, methods=${gwMethods}`);
		} else {
			log("  ⚠ Gateway details not found in log (may need rebuild with latest code)");
		}
	}

	return true;
}

// ── Phase 5: Verify WebSocket chain (agent-core → Gateway) ──

async function verifyWebSocketChain() {
	log("Phase 5: Verify WebSocket chain (agent-core → Gateway via E2E probe)");

	const logPath = resolve(homedir(), ".naia/logs/naia.log");
	if (!existsSync(logPath)) {
		fail("WebSocket probe", "naia.log not found");
		return false;
	}

	// The app sends a skill_diagnostics probe through agent-core when CAFE_DEBUG_E2E=1.
	// Wait up to 30s for the probe response to appear in logs.
	const start = Date.now();
	const maxWait = 30_000;

	while (Date.now() - start < maxWait) {
		const logContent = readFileSync(logPath, "utf-8");

		// Check if the probe was sent
		const probeSent = logContent.includes("[E2E-DEBUG] Gateway WebSocket probe sent");

		// Check for the tool_result response from agent-core
		const probeResult = logContent.match(
			/\[E2E-DEBUG\] agent_response tool_result tool=skill_diagnostics success=(\w+) output_head=(.+)/
		);

		if (probeResult) {
			const [, success, outputHead] = probeResult;
			if (success === "true") {
				ok(`WebSocket chain verified: agent-core → Gateway → skill_diagnostics success`);

				// Parse the output to show Gateway status
				try {
					const status = JSON.parse(outputHead);
					if (status.ok) {
						ok(`WebSocket probe: Gateway ok=${status.ok}, version=${status.version || "?"}`);
					}
				} catch {
					// Output may be truncated, that's fine
					ok(`WebSocket probe output: ${outputHead.slice(0, 80)}`);
				}
				return true;
			} else {
				fail("WebSocket chain", `skill_diagnostics returned success=false: ${outputHead.slice(0, 100)}`);
				return false;
			}
		}

		if (probeSent) {
			const elapsed = Math.round((Date.now() - start) / 1000);
			if (elapsed % 5 === 0 && elapsed > 0) {
				log(`  Probe sent, waiting for response... (${elapsed}s)`);
			}
		}

		await sleep(1000);
	}

	// Check if probe was even sent
	const finalLog = readFileSync(logPath, "utf-8");
	if (finalLog.includes("Gateway WebSocket probe failed")) {
		fail("WebSocket chain", "Probe send failed (agent-core not running?)");
	} else if (!finalLog.includes("Gateway WebSocket probe sent")) {
		fail("WebSocket chain", "Probe not sent (CAFE_DEBUG_E2E not active or Gateway not running)");
	} else {
		fail("WebSocket chain", "Probe sent but no response within 30s");
	}
	return false;
}

// ── Cleanup ──

function cleanup() {
	log("Cleanup");

	if (appProcess && !appProcess.killed) {
		appProcess.kill();
		log("  App process killed");
	}

	// Kill gateway in WSL
	try {
		execSync("wsl -d NaiaEnv -- pkill -f openclaw 2>/dev/null", { stdio: "ignore" });
		log("  WSL openclaw processes killed");
	} catch { /* ignore */ }

	if (!SKIP_CLEANUP) {
		try {
			execSync("taskkill /F /IM naia-shell.exe 2>NUL", { stdio: "ignore" });
		} catch { /* ignore */ }
	}
}

// ── Main ──

async function main() {
	console.log("╔══════════════════════════════════════════════╗");
	console.log("║  Naia Windows App E2E — Gateway Connection  ║");
	console.log("╚══════════════════════════════════════════════╝");
	console.log();

	if (!checkPreconditions()) {
		log("⚠ Preconditions failed — aborting");
		process.exit(1);
	}
	console.log();

	const appLogs = launchApp();
	console.log();

	const gatewayOk = await waitForGateway();
	console.log();

	if (gatewayOk) {
		await verifyGateway();
		console.log();

		await verifyWebSocketChain();
	}
	console.log();

	cleanup();

	console.log();
	console.log("════════════════════════════════════════════════");
	console.log(`  Results: ${passed} passed, ${failed} failed`);
	console.log("════════════════════════════════════════════════");

	if (failed > 0) {
		console.log("\n  App stderr (last 500 chars):");
		const stderr = appLogs.appStderr();
		console.log("  " + stderr.slice(-500).replace(/\n/g, "\n  "));
	}

	process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal error:", e);
	cleanup();
	process.exit(1);
});
