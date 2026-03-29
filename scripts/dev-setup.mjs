#!/usr/bin/env node
/**
 * Cross-platform dev setup — runs before `cargo tauri dev`.
 *
 * 1. Kill stale naia-shell processes
 * 2. Install gateway if missing
 * 3. Build agent
 *
 * Platform-specific logic is isolated in the `platform` object.
 * To add macOS: add a "darwin" key.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { resolve } from "node:path";

const isWin = platform() === "win32";
const isMac = platform() === "darwin";
const isLinux = platform() === "linux";

// ─── 1. Kill stale processes ─────────────────────────────────────────────────

function killStale() {
	try {
		if (isWin) {
			execSync('taskkill /F /IM naia-shell.exe 2>nul', { stdio: "ignore" });
		} else {
			execSync("pkill -9 -x naia-shell", { stdio: "ignore" });
		}
	} catch { /* not running — fine */ }

	try {
		if (isWin) {
			// Windows: no reliable port-kill needed — single-instance mutex handles it
		} else {
			const pid = execSync("lsof -ti:1420", { encoding: "utf8" }).trim();
			if (pid) execSync(`kill -9 ${pid}`, { stdio: "ignore" });
		}
	} catch { /* port free — fine */ }
}

// ─── 2. Gateway install check ────────────────────────────────────────────────

function ensureGateway() {
	const gatewayPath = join(
		homedir(),
		".naia/openclaw/node_modules/openclaw/openclaw.mjs",
	);
	if (!existsSync(gatewayPath)) {
		console.log("[Naia] Gateway not installed — running install-gateway.sh...");
		execSync("bash ../scripts/install-gateway.sh", { stdio: "inherit" });
	}
}

// ─── 3. Agent build ──────────────────────────────────────────────────────────

function buildAgent() {
	const agentDir = resolve("../agent");
	execSync("pnpm install", {
		cwd: agentDir,
		stdio: "inherit",
		env: { ...process.env, CI: "true" },
	});
	try {
		execSync("pnpm build", { cwd: agentDir, stdio: "inherit" });
	} catch {
		// tsc may fail on non-critical type errors — check if dist exists
		if (existsSync(join(agentDir, "dist", "index.js"))) {
			console.log("[dev-setup] Agent build had type errors but dist exists — continuing");
		} else {
			throw new Error("Agent build failed and no dist found");
		}
	}
}

// ─── 4. Platform env ─────────────────────────────────────────────────────────

function setPlatformEnv() {
	if (isLinux) {
		// Tauri WebKitGTK needs X11 for XReparentWindow browser embedding
		process.env.GDK_BACKEND = "x11";
	}
}

// ─── Run ─────────────────────────────────────────────────────────────────────

killStale();
ensureGateway();
buildAgent();
setPlatformEnv();
