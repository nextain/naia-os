#!/usr/bin/env node
/**
 * WSL Setup Flow Verification Script
 * Replicates the exact logic from:
 *   - platform/wsl.rs (check_wsl_status, is_distro_registered)
 *   - platform/windows.rs (setup_wsl_environment)
 *
 * Run: node scripts/test-wsl-setup.mjs
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const DISTRO_NAME = "NaiaEnv";

// ── Helpers (mirror wsl.rs decode_utf16_lossy) ──────────────────────────

function decodeWslOutput(buffer) {
	// WSL outputs UTF-16LE on Windows — try to decode
	if (buffer.length >= 2 && buffer.length % 2 === 0) {
		// Check for UTF-16LE BOM or pattern
		const u16 = [];
		for (let i = 0; i < buffer.length; i += 2) {
			u16.push(buffer[i] | (buffer[i + 1] << 8));
		}
		// Strip BOM
		const start = u16[0] === 0xfeff ? 1 : 0;
		const decoded = String.fromCharCode(...u16.slice(start));
		// If it looks like valid text, use it
		if (decoded.includes("wsl") || decoded.includes("WSL") || decoded.includes("ok") || decoded.includes("NaiaEnv") || /[a-zA-Z]/.test(decoded)) {
			return decoded;
		}
	}
	return buffer.toString("utf-8");
}

function runWsl(args) {
	const result = spawnSync("wsl.exe", args, {
		windowsHide: true,
		timeout: 30000,
	});
	return {
		status: result.status,
		stdout: result.stdout ? decodeWslOutput(result.stdout) : "",
		stderr: result.stderr ? decodeWslOutput(result.stderr) : "",
		error: result.error,
	};
}

// ── Step 1: check_wsl_status() — mirrors wsl.rs ────────────────────────

function checkWslStatus() {
	console.log("\n=== Step 1: check_wsl_status() ===");

	// Method 1: wsl --version
	console.log("  [1a] Running: wsl --version");
	const v = runWsl(["--version"]);
	if (!v.error && v.status === 0) {
		console.log("  ✅ WSL is installed and functional");
		console.log("  stdout:", v.stdout.trim().split("\n")[0]);
		return true;
	}
	console.log("  ❌ wsl --version failed (status:", v.status, ")");
	if (v.error) console.log("  error:", v.error.message);

	// Method 2: wsl echo ok
	console.log("  [1b] Running: wsl echo ok");
	const e = runWsl(["echo", "ok"]);
	if (!e.error && e.stdout.trim().includes("ok")) {
		console.log("  ✅ WSL functional (echo ok succeeded)");
		return true;
	}
	console.log("  ❌ wsl echo ok failed");
	console.log("  stderr:", e.stderr.trim().substring(0, 200));
	return false;
}

// ── Step 2: is_wsl_available() ──────────────────────────────────────────

function isWslAvailable() {
	try {
		return checkWslStatus();
	} catch {
		return false;
	}
}

// ── Step 3: is_distro_registered() — mirrors wsl.rs ────────────────────

function isDistroRegistered(name) {
	console.log(`\n=== Step 3: is_distro_registered("${name}") ===`);
	const result = runWsl(["-l", "-q"]);
	if (result.error) {
		console.log("  ❌ wsl -l -q failed:", result.error.message);
		return false;
	}
	const lines = result.stdout.split("\n").map((l) => l.trim());
	console.log("  Registered distros:", lines.filter(Boolean));
	const found = lines.some((l) => l === name);
	console.log(`  ${name}: ${found ? "✅ registered" : "❌ not registered"}`);
	return found;
}

// ── Step 4: setup_wsl_environment() — mirrors windows.rs ────────────────

function setupWslEnvironment() {
	console.log("\n=== Step 4: setup_wsl_environment() ===");

	// 4a: Check WSL availability
	const wslAvailable = isWslAvailable();
	if (!wslAvailable) {
		console.log("\n  [4a] WSL not available — would run:");
		console.log('  powershell Start-Process wsl.exe -ArgumentList "--install","--no-distribution" -Verb RunAs -Wait');
		console.log("  ⚠️  This requires admin elevation (UAC popup)");
		console.log("  ⚠️  May require system restart after install");

		// Actually try to install (will prompt UAC)
		console.log("\n  Attempting WSL install with admin elevation...");
		try {
			const installResult = spawnSync(
				"powershell.exe",
				[
					"-NoProfile",
					"-Command",
					"Start-Process -FilePath 'wsl.exe' -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait; exit $LASTEXITCODE",
				],
				{ windowsHide: true, timeout: 180000 },
			);
			console.log("  Install exit code:", installResult.status);
			if (installResult.stderr?.length > 0) {
				console.log("  stderr:", installResult.stderr.toString().trim().substring(0, 200));
			}
		} catch (e) {
			console.log("  ❌ Install failed:", e.message);
		}

		// Re-check
		console.log("\n  Re-checking WSL availability after install...");
		const nowAvailable = isWslAvailable();
		if (!nowAvailable) {
			console.log("  ❌ WSL still not available — restart required");
			console.log('  → Naia would show: "Please restart your computer and reopen Naia"');
			return false;
		}
	}

	// 4b: Copy .wslconfig
	console.log("\n  [4b] .wslconfig template");
	const wslconfigDest = join(HOME, ".wslconfig");
	if (existsSync(wslconfigDest)) {
		console.log("  ✅ .wslconfig already exists at", wslconfigDest);
	} else {
		const templatePath = join(process.cwd(), "config/defaults/wslconfig-template");
		if (existsSync(templatePath)) {
			const content = readFileSync(templatePath, "utf-8");
			console.log("  Template content:");
			console.log("  " + content.replace(/\n/g, "\n  "));
			writeFileSync(wslconfigDest, content);
			console.log("  ✅ .wslconfig written to", wslconfigDest);
		} else {
			console.log("  ❌ Template not found at", templatePath);
		}
	}

	// 4c: Check NaiaEnv distro
	const distroReady = isDistroRegistered(DISTRO_NAME);
	if (!distroReady) {
		console.log("\n  [4c] NaiaEnv not registered — would import rootfs");
		console.log("  Checked locations:");
		const searchPaths = [
			join(HOME, "Downloads", "NaiaEnv-rootfs.tar.gz"),
			join(HOME, "Desktop", "NaiaEnv-rootfs.tar.gz"),
			join(HOME, ".naia", "NaiaEnv-rootfs.tar.gz"),
		];
		for (const p of searchPaths) {
			console.log(`    ${existsSync(p) ? "✅" : "❌"} ${p}`);
		}
		console.log("  → NaiaEnv rootfs not available (expected for fresh install)");
	}

	return wslAvailable;
}

// ── Step 5: try_platform_gateway_spawn() — mirrors windows.rs ───────────

function tryPlatformGatewaySpawn() {
	console.log("\n=== Step 5: try_platform_gateway_spawn() ===");
	const wslAvailable = isWslAvailable();
	const distroRegistered = wslAvailable && isDistroRegistered(DISTRO_NAME);

	if (!wslAvailable || !distroRegistered) {
		const reason = "Windows Tier 1 mode — Gateway skipped (WSL/NaiaEnv not found)";
		console.log(`  Result: Skip { reason: "${reason}" }`);
		return "skip";
	}

	console.log("  Result: Would spawn Gateway in WSL (Tier 2)");
	return "spawn";
}

// ── Step 6: get_platform_tier_info() — mirrors windows.rs ───────────────

function getPlatformTierInfo() {
	console.log("\n=== Step 6: get_platform_tier_info() ===");
	const wslAvailable = isWslAvailable();
	const distroRegistered = wslAvailable && isDistroRegistered(DISTRO_NAME);
	const tier = distroRegistered ? 2 : 1;
	const info = {
		platform: "windows",
		tier,
		wsl: wslAvailable,
		distro: distroRegistered,
	};
	console.log("  Result:", JSON.stringify(info, null, 2));
	return info;
}

// ── Main ────────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  Naia WSL Setup Flow Verification                   ║");
console.log("║  Replicates platform/wsl.rs + platform/windows.rs   ║");
console.log("╚══════════════════════════════════════════════════════╝");
console.log("Home:", HOME);
console.log("Platform:", process.platform);

const wslOk = setupWslEnvironment();
tryPlatformGatewaySpawn();
getPlatformTierInfo();

console.log("\n══════════════════════════════════════════════════════");
console.log("Summary:");
if (wslOk) {
	console.log("  ✅ WSL is functional");
} else {
	console.log("  ❌ WSL not functional — restart may be needed");
}
console.log("══════════════════════════════════════════════════════");
