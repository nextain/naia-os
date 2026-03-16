#!/usr/bin/env node
/**
 * DLL Bundle Check Hook (PostToolUse on Bash)
 *
 * After `cargo build --release` or `tauri build`, scans target/release/ for
 * third-party .dll files and checks that each one is declared in
 * tauri.conf.windows.json resources.
 *
 * Prevents the classic "builds fine, DLL missing at install" bug.
 *
 * Skipped DLLs:
 * - naia_shell_lib.dll (our own code, auto-bundled)
 * - WebView2*.dll (system, auto-bundled by Tauri)
 * - *.dll inside subdirectories (only checks top-level)
 */

const fs = require("fs");
const path = require("path");

// DLLs that are auto-bundled or not needed in resources
const SKIP_PATTERNS = [
	/^naia/i,
	/^WebView2/i,
	/^tauri/i,
];

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
	const cwd = data.cwd || process.cwd();

	// Only check Bash commands that look like release builds
	if (toolName !== "Bash") process.exit(0);
	if (
		!command.includes("cargo build") &&
		!command.includes("tauri build")
	) {
		process.exit(0);
	}
	// Only check release builds — dev builds don't produce NSIS bundles
	if (!command.includes("release") && !command.includes("tauri build")) {
		process.exit(0);
	}

	// Find tauri.conf.windows.json by walking up from cwd
	// Handles cwd = project root, shell/, shell/src-tauri, etc.
	let confPath = null;
	let searchDir = path.resolve(cwd);
	for (let i = 0; i < 6; i++) {
		const candidates = [
			path.join(searchDir, "tauri.conf.windows.json"),
			path.join(searchDir, "src-tauri", "tauri.conf.windows.json"),
			path.join(searchDir, "shell", "src-tauri", "tauri.conf.windows.json"),
		];
		for (const c of candidates) {
			if (fs.existsSync(c)) { confPath = c; break; }
		}
		if (confPath) break;
		const parent = path.dirname(searchDir);
		if (parent === searchDir) break; // reached filesystem root
		searchDir = parent;
	}

	if (!confPath) process.exit(0);

	const srcTauriDir = path.dirname(confPath);
	const releaseDir = path.join(srcTauriDir, "target", "release");

	if (!fs.existsSync(confPath) || !fs.existsSync(releaseDir)) {
		process.exit(0); // Not a Tauri Windows project
	}

	// Read tauri.conf.windows.json resources
	let conf;
	try {
		conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
	} catch {
		process.exit(0);
	}

	const resources = conf?.bundle?.resources || {};
	const declaredDlls = new Set();
	for (const [src, dest] of Object.entries(resources)) {
		if (src.endsWith(".dll") || (typeof dest === "string" && dest.endsWith(".dll"))) {
			const dllName = typeof dest === "string" ? path.basename(dest) : path.basename(src);
			declaredDlls.add(dllName.toLowerCase());
		}
	}

	// Scan target/release/ for .dll files (top-level only)
	let dlls;
	try {
		dlls = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".dll"));
	} catch {
		process.exit(0);
	}

	// Find missing DLLs
	const missing = [];
	for (const dll of dlls) {
		if (SKIP_PATTERNS.some((p) => p.test(dll))) continue;
		if (!declaredDlls.has(dll.toLowerCase())) {
			missing.push(dll);
		}
	}

	if (missing.length === 0) {
		process.exit(0);
	}

	// Warn about missing DLLs
	const result = {
		hookSpecificOutput: {
			hookEventName: "dll_bundle_warning",
			additionalContext: [
				`⚠️ DLL BUNDLE CHECK: ${missing.length} DLL(s) found in target/release/ but NOT declared in tauri.conf.windows.json resources:`,
				...missing.map((d) => `  - ${d}`),
				"",
				"These DLLs will be missing from the NSIS installer.",
				"Add them to shell/src-tauri/tauri.conf.windows.json → bundle.resources",
				'Example: "target/release/libvosk.dll": "libvosk.dll"',
			].join("\n"),
		},
	};

	process.stdout.write(JSON.stringify(result));
}

main().catch(() => process.exit(0));
