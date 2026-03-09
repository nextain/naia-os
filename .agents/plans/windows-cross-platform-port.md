# Naia Shell — Windows Support Plan

> **GitHub Issue**: https://github.com/nextain/naia-os/issues/4
> **Scope**: Windows only. macOS/SteamOS are separate issues.
> **Constraint**: Existing Linux must not break. Design for future platform extensibility.

Date: 2026-03-06 (updated: 2026-03-09)

## Architecture

```
                    ┌─ Linux (current) ─── Flatpak / AppImage / DEB / RPM
Naia Shell ─────────┤
(Tauri 2 + React)   └─ Windows (NEW) ───── Store (MSIX) / NSIS installer
                                            └── WSL2 "NaiaEnv" (optional Tier 2)
```

### Tier Model (Windows)

| Tier | Features | Requirements |
|------|----------|-------------|
| Tier 1 (Basic) | Chat, Avatar, TTS (Edge), Voice (Gemini Live), Memory (SQLite facts), Discord webhook, Built-in skills | None (standalone Windows app) |
| Tier 2 (Advanced) | + Gateway (OpenClaw), exec.bash, Local LLM (Ollama), Local voice gen, Discord bidirectional bot, 50+ skills, Cron, Sessions | WSL2 + NaiaEnv distro |

---

## Platform Matrix: Linux vs Windows

### Shell (Tauri 2 Rust + React frontend)

| Component | Linux (current) | Windows (NEW) |
|-----------|:-----:|:-------:|
| WebView engine | WebKit2GTK | WebView2 (Edge) |
| Window management | Tauri default | Tauri default |
| Deep link (naia://) | .desktop file | Registry |
| Single instance | D-Bus | Named Mutex |
| Secure store (plugin-store) | File-based | File-based |
| Dialog (plugin-dialog) | GTK | WinRT |
| SQLite (rusqlite bundled) | OK | OK |
| Three.js / WebGL | OK | OK |

**Frontend (React/TypeScript)**: Zero platform-specific code found. All path handling delegates to Rust backend.

### Agent (Node.js)

| Component | Linux | Windows |
|-----------|:-----:|:-------:|
| LLM providers (Gemini/Claude/xAI) | OK | OK |
| Edge TTS (msedge-tts npm) | OK | OK |
| WebSocket client (gateway) | OK | OK |
| stdio protocol (Shell<->Agent) | OK | OK |
| Device identity (Ed25519 crypto) | OK | OK |
| CronStore (JSON file) | OK | OK* |
| Memo skill (fs read/write) | OK | OK* |

*path resolution issues — `process.env.HOME` not set on Windows (see B1)

### Gateway (OpenClaw)

| Component | Linux | Windows (WSL) |
|-----------|:-----:|:-------------:|
| exec.bash | Native | WSL |
| systemd service | Native | WSL systemd |
| Channels (Discord/Telegram) | OK | OK (WSL) |
| Skills ecosystem (50+) | OK | OK (WSL) |
| Semantic memory search | OK | OK (WSL) |
| Local LLM (Ollama + CUDA) | OK | OK (WSL+CUDA) |

---

## Modification Inventory

### A. Rust (lib.rs)

> **NOTE**: Line numbers are from 2026-03-06 snapshot and WILL drift.
> Always locate by **function name**, not line number.

#### A1. CRITICAL: is_pid_alive() — /proc is Linux-only

```
is_pid_alive() uses /proc/{pid} — BROKEN on macOS (no /proc) and Windows.
  FIX:
    #[cfg(unix)]
    fn is_pid_alive(pid: u32) -> bool {
        unsafe { libc::kill(pid as i32, 0) == 0 }
        // Returns true if process exists. EPERM (no permission) also means alive
        // but kill() returns -1 in that case — acceptable false-negative for our use.
        // Works on Linux, macOS, SteamOS.
    }
    #[cfg(windows)]
    fn is_pid_alive(pid: u32) -> bool {
        let handle = unsafe { windows_sys::Win32::System::Threading::OpenProcess(
            0x0400, // PROCESS_QUERY_INFORMATION
            0, pid
        ) };
        if handle == 0 { return false; }  // OpenProcess returns 0 on failure
        let mut exit_code: u32 = 0;
        let alive = unsafe {
            windows_sys::Win32::System::Threading::GetExitCodeProcess(handle, &mut exit_code) != 0
                && exit_code == 259 // STILL_ACTIVE
        };
        unsafe { windows_sys::Win32::Foundation::CloseHandle(handle); }
        alive
    }
```

NOTE: SIGTERM/SIGKILL calls (cleanup_orphan_processes) are handled by A2 — entire function gated.

#### A2. CRITICAL: cleanup_orphan_processes() — entire function is Unix-only

```
cleanup_orphan_processes():
  Uses PID files + is_pid_alive() (fixed in A1) + libc::kill(SIGTERM/SIGKILL).
  Signal-based kill is Unix-only. The entire function must be gated.
  FIX: #[cfg(unix)] fn cleanup_orphan_processes() { ... current code ... }
       #[cfg(windows)] fn cleanup_orphan_processes() {
           // Windows: use Job Objects or skip (Tauri handles child cleanup)
           // PID files still work on Windows, but signal-based kill does not.
           // For now: no-op. Gateway runs in WSL (Tier 2) or is not spawned (Tier 1).
       }
```

#### A3. CRITICAL: Command execution (2 items)

```
spawn_gateway() → Command::new("pkill").arg("-f").arg("openclaw.*gateway")
  Linux/SteamOS: OK
  macOS: OK (pkill available via proctools)
  Windows: No pkill
  FIX: #[cfg(unix)] pkill, #[cfg(windows)] taskkill or wsl -d NaiaEnv -- pkill

spawn_gateway() → Command::new("true") (dummy process for externally-managed gateway)
  Linux/macOS/SteamOS: OK
  Windows: No /bin/true
  FIX: #[cfg(unix)] Command::new("true"), #[cfg(windows)] Command::new("cmd").args(["/c", "exit", "0"])

Tests: Command::new("true") also used in 3 test sites.
  FIX: #[cfg(unix)] gate on test functions, or use platform-agnostic dummy.
```

#### A4. CRITICAL: Home directory (10 sites)

All use `std::env::var("HOME")` with fallback `/tmp` or empty:
```
Functions using HOME (10 sites):
  log_dir()                  — ~/.naia/logs/
  run_dir()                  — ~/.naia/run/
  find_node_binary()         — ~/.nvm/versions/node/
  find_openclaw_paths()      — ~/.naia/openclaw/, ~/.openclaw/
  ensure_openclaw_config()   — ~/.openclaw/workspace/
  list_skills()              — ~/.naia/skills/
  read_openclaw_memory_files() — ~/.openclaw/workspace/memory/
  reset_openclaw_data()      — ~/.naia/, ~/.openclaw/
  read_discord_bot_token()   — ~/.openclaw/
  sync_openclaw_config()     — ~/.openclaw/openclaw.json

  Windows: HOME usually NOT set (USERPROFILE instead)
  FIX: 1. Add `dirs = "5"` to Cargo.toml dependencies
       2. Create helper fn:
    fn home_dir() -> PathBuf {
        dirs::home_dir().unwrap_or_else(|| {
            #[cfg(unix)] { PathBuf::from("/tmp") }
            #[cfg(windows)] { PathBuf::from(std::env::var("TEMP").unwrap_or("C:\\Temp".into())) }
        })
    }
       3. Replace all 10 sites with home_dir() call
```

Dot-directory mapping:
```
  Linux/macOS/SteamOS: ~/.naia/, ~/.openclaw/ (hidden files OK)
  Windows: %APPDATA%\naia\, %APPDATA%\openclaw\ (or keep dot-dirs, Windows supports them)
  DECISION: Keep ~/.naia/ and ~/.openclaw/ on all platforms.
            Windows supports dot-directories since Win10.
            Simpler than platform-specific paths, and WSL shares the same home.
```

#### A5. CRITICAL: Flatpak-specific paths (5 items)

```
find_node_binary():     "/app/bin/node" (Flatpak Node.js)
find_openclaw_paths():  "/app/lib/naia-os/openclaw/...", "/usr/share/naia/openclaw/..."
load_bootstrap_config():"/app/lib/naia-os/openclaw-bootstrap.json"
spawn_agent_core():     "/app/lib/naia-os/agent/dist/index.js" (2 sites)
  Linux/SteamOS: Relevant (Flatpak distribution)
  macOS: Not relevant (no Flatpak)
  Windows: Not relevant (no Flatpak)
  FIX: Gate Flatpak paths behind #[cfg(target_os = "linux")] or
       runtime check (std::env::var("FLATPAK"))
       Windows paths: Tauri resource_dir() already works (see spawn_agent_core)
```

#### A6. MAJOR: Node.js discovery — platform-specific paths

```
find_node_binary() current search order:
  1. /app/bin/node (Flatpak)
  2. system PATH: node
  3. nvm: ~/.nvm/versions/node, ~/.config/nvm/versions/node

Missing paths for Windows:
    1. {exe_dir}/resources/node.exe (bundled — HIGHEST PRIORITY on Windows)
    2. system PATH: node.exe
    3. NVM for Windows: %APPDATA%\nvm\v22.*\node.exe
    4. fnm: %APPDATA%\fnm\node-versions\v22.*\installation\node.exe

  FIX: Restructure find_node_binary() with #[cfg] per platform:
    #[cfg(target_os = "linux")] → Flatpak → PATH → nvm (current)
    #[cfg(target_os = "windows")] → bundled exe_dir → PATH → nvm-windows → fnm
    (macOS paths: separate issue)
```

#### A7. MAJOR: Gateway spawn — Windows-aware flow (NEW)

```
spawn_gateway() → Command::new(node_bin) for Gateway process
spawn_node_host() → Command::new(node_bin) for Node Host
  Linux/macOS/SteamOS: Direct spawn (current behavior)

  Windows: MUST NOT call find_openclaw_paths() on Tier 1 — it only knows
  Linux paths and would emit confusing "OpenClaw not installed" error.

  FIX: Platform + tier conditional:
    #[cfg(unix)] → direct spawn (current)
    #[cfg(windows)] → {
        let tier = read_windows_tier_setting(); // from tauri-plugin-store
        match tier {
            Tier1 => {
                log_both("[Naia] Windows Tier 1 — Gateway not needed");
                emit("gateway_status", { "running": false, "tier1": true });
                return Ok(GatewayProcess { we_spawned: false, ... });
            }
            Tier2 => {
                // Check WSL + NaiaEnv, then spawn via WSL
                wsl_spawn_gateway()?
            }
        }
    }

  ensure_openclaw_config() + sync_openclaw_config():
    Both need #[cfg(unix)] gate or Tier check — on Windows Tier 1,
    no OpenClaw config should be created. On Tier 2, config lives inside WSL.
    sync_openclaw_config() calls ensure_openclaw_config() and writes to ~/.openclaw/ — must skip entirely on Tier 1.
```

#### A8. MINOR: WebKit-specific (already handled, 3 items)

```
lib.rs top: #[cfg(target_os = "linux")] webkit2gtk imports — OK
setup handler: #[cfg(target_os = "linux")] EGL/permission block — OK
main.rs: #[cfg(target_os = "linux")] WEBKIT_DISABLE_DMABUF_RENDERER — OK
  macOS: Uses WKWebView, not WebKit2GTK. Tauri handles this automatically.
  NO CHANGES NEEDED.
```

#### A9. MINOR: Test code (4 items)

```
Tests use Command::new("true") in 3 sites + ".naia/logs" assertion in 1 site.
  FIX: #[cfg(unix)] gate test functions, or use platform-agnostic dummy/assertions.
  LOW PRIORITY — tests can be gated per platform.
```

#### A10–A11: macOS / SteamOS considerations → separate issues

> macOS and SteamOS platform-specific items are tracked in their own GitHub issues.
> Cross-platform foundation items (A1–A5) already cover what's needed for future extensibility.

---

### B. Agent (Node.js)

#### B1. CRITICAL: process.env.HOME (4 sites in 3 files)

```
tool-bridge.ts  — cronStorePath      (process.env.HOME)
tool-bridge.ts  — customSkillsDir    (process.env.HOME)
memo.ts         — memoDir            (process.env.HOME)
notify-config.ts — config path       (process.env.HOME)

  FIX: Replace all 4 sites with:
    import { homedir } from "node:os";
    const home = homedir();
  homedir() works correctly on ALL platforms (Linux, macOS, Windows).
  Note: index.ts, device-identity.ts, naia-discord.ts already use homedir() correctly.
```

#### B2. OK: bash hardcoding (3 items) — no change needed

```
tool-bridge.ts (exec.bash handler) — command: ["bash", "-lc", command]
tool-bridge.ts (Flatpak variant)   — flatpak-spawn --host bash -c '...'
loader.ts (custom skill exec)      — command: ["bash", "-lc", command]

  Linux/macOS/SteamOS: bash available
  Windows: bash NOT available (unless WSL)
  FIX: These run via Gateway RPC (exec.bash, node.invoke).
       On Windows, Gateway runs IN WSL → bash is available inside WSL.
       On macOS, bash is available natively (or zsh as default shell).
       NO CODE CHANGE NEEDED — Gateway handles the shell environment.
       The bash commands are executed WHERE the Gateway runs, not where the Agent runs.
```

#### B3. OK: Unix shell commands in tool-bridge.ts (5 items) — no change needed for Tier 2

```
tool-bridge.ts exec.bash calls: cat, mkdir -p, printf, grep -rl, find
  (5 distinct shell command patterns in readFile/writeFile/searchFiles handlers)

  Same as B2 — these are sent TO Gateway (exec.bash RPC).
  Gateway runs on Linux (native or WSL) → Unix commands work.
  NO CODE CHANGE NEEDED for exec'd commands.

  However: read_file, write_file, search_files COULD use Node.js fs APIs
  as a Gateway-independent fallback for Tier 1 mode.
  FIX (enhancement): Add fs-based fallback when Gateway unavailable.
```

#### B4. MEDIUM: Flatpak detection (1 item)

```
tool-bridge.ts (isFlatpak check)  — fs.existsSync("/.flatpak-info")
claude-code-cli.ts (Flatpak check) — existsSync("/run/flatpak-info") || process.env.FLATPAK === "1"

  Windows/macOS: Always false (harmless but wasteful)
  FIX: Add process.platform === "linux" guard (optional, low priority)
```

#### B5. MEDIUM: SIGTERM signals (1 item)

```
claude-code-cli.ts (child process management) — child.kill("SIGTERM") in 3 sites

  Node.js on Windows: kill("SIGTERM") calls TerminateProcess (force kill).
  Behavior differs but doesn't crash.
  FIX: Optional — use child.kill() without argument for cross-platform default.
```

#### B6. OK: Already cross-platform (no changes needed)

```
index.ts          — homedir() already used (correct)
device-identity.ts — homedir() already used (correct)
client.ts         — WebSocket, platform-agnostic
naia-discord.ts   — homedir() already used (correct)
system-status.ts  — os.platform() (returns correct value per OS)
cron/store.ts     — path.join + fs APIs (cross-platform)
All LLM providers — HTTP API calls (cross-platform)
All TTS providers — HTTP/npm (cross-platform)
```

---

### C. Build & Distribution Pipeline

#### C1. CI/CD Matrix

```yaml
# .github/workflows/release-app.yml (expanded)
# WARNING: Current CI builds frontend inside each platform job independently.
# Refactoring to shared build-frontend job is a structural change — must
# verify that frontend artifacts (dist/) are platform-independent (they are:
# Vite outputs static HTML/JS/CSS, no native bindings).

jobs:
  build-frontend:  # SHARED — runs once (NEW)
    runs-on: ubuntu-latest
    steps:
      - pnpm install && pnpm build (shell frontend)
      - cd agent && pnpm build
      - upload-artifact: frontend-dist

  build-linux:
    needs: build-frontend
    runs-on: ubuntu-22.04
    outputs: AppImage, DEB, RPM

  build-flatpak:  # UNCHANGED — self-contained (flatpak-builder manages its own build)
    needs: []  # independent, cannot use shared frontend
    runs-on: ubuntu-latest
    outputs: Flatpak

  build-windows:  # NEW
    needs: build-frontend
    runs-on: windows-latest
    steps:
      - Download frontend-dist
      - Download Node.js 22 portable (node.exe ~50MB) → shell/src-tauri/resources/node.exe
      - cargo tauri build --config src-tauri/tauri.conf.windows.json
      - # Tauri 2 natively supports: nsis, msi
      - # MSIX: post-process with makeappx.exe + signtool.exe (Windows SDK)
      - #   Requires: Windows code signing certificate (EV recommended for Store)
    outputs: NSIS (.exe installer), MSI, MSIX

  build-wsl-distro:  # NEW — WSL rootfs for Windows Tier 2
    needs: []  # independent
    runs-on: ubuntu-latest
    steps:
      - Create minimal rootfs (Alpine or Ubuntu)
      - Install Node.js 22 + OpenClaw + Ollama
      - Configure systemd, wsl.conf
      - podman export → tar.gz
    outputs: naia-wsl-rootfs.tar.gz (~250MB)

  release:
    needs: [build-linux, build-flatpak, build-windows, build-wsl-distro]
    steps:
      - Download all artifacts
      - SHA256SUMS
      - GitHub Release
      - MS Store submit (winapp) — Windows MSIX
```

#### C2. Tauri Configuration Files

```
shell/src-tauri/
├── tauri.conf.json              # Shared: app name, version, CSP, identifier, resources
│                                # MODIFIED: remove "targets" and "linux" sections (moved to platform configs)
├── tauri.conf.linux.json        # Linux: targets=["deb","rpm","appimage"] (NEW — extract from current tauri.conf.json)
├── tauri.conf.windows.json      # Windows: targets=["nsis","msi"], node.exe in resources
├── tauri.conf.macos.json        # macOS: (future — separate issue)
├── tauri.conf.flatpak.json      # Flatpak: override beforeBuildCommand (existing)
└── Cargo.toml                   # Conditional deps (webkit2gtk linux-only, existing)
                                 # NEW: add `dirs = "5"` to [dependencies]
                                 # NEW: add `[target.'cfg(windows)'.dependencies]`
                                 #      `windows-sys = { version = "0.59", features = ["Win32_System_Threading", "Win32_Foundation"] }`
```

**PREREQUISITE 1**: Current tauri.conf.json has `targets: ["deb","rpm","appimage"]` and
a `linux: { deb: {}, rpm: {}, appimage: {} }` section (Linux-only bundle config).
Must extract BOTH to `tauri.conf.linux.json` — otherwise Windows build attempts Linux targets.

tauri.conf.linux.json content:
```json
{
  "build": { "beforeBuildCommand": "" },
  "bundle": {
    "targets": ["deb", "rpm", "appimage"],
    "linux": {
      "deb": { "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"], "desktopTemplate": null },
      "rpm": { "depends": ["webkit2gtk4.1", "gtk3"] },
      "appimage": { "bundleMediaFramework": false }
    }
  }
}
```
NOTE: `beforeBuildCommand: ""` because shared build-frontend job already built the frontend.
Same pattern as existing tauri.conf.flatpak.json.

CI: `cargo tauri build --config src-tauri/tauri.conf.linux.json` for Linux,
     `cargo tauri build --config src-tauri/tauri.conf.windows.json` for Windows.

**PREREQUISITE 2**: Current tauri.conf.json has identifier `com.naia.shell`,
but Flatpak uses `io.nextain.naia`. Must unify identifier before Windows builds.
Decision: Use `io.nextain.naia` everywhere (reverse-domain, required by MSIX/App Store).

**Breaking change — data migration needed**:
Tauri derives `app_config_dir()` from identifier. Changing it moves the data directory:
- Linux: `~/.config/com.naia.shell/` → `~/.config/io.nextain.naia/`
- Windows: `%APPDATA%/com.naia.shell/` → `%APPDATA%/io.nextain.naia/`
Affected files: `audit.db`, `memory.db`, `window-state.json`, plugin-store data.
FIX: On first run, check if old dir exists → copy/symlink to new dir → log migration.

Also update Flatpak D-Bus permission: `--own-name=com.naia.shell.*` → `--own-name=io.nextain.naia.*`
in `flatpak/io.nextain.naia.yml` (the flathub manifest does NOT have this permission).

**tauri.conf.windows.json content** (merged with base tauri.conf.json by Tauri):
```json
{
  "build": { "beforeBuildCommand": "" },
  "bundle": {
    "targets": ["nsis", "msi"],
    "resources": {
      "resources/node.exe": "node.exe"
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```
NOTE: agent/dist, agent/package.json, agent/node_modules are already in base tauri.conf.json resources.
Tauri 2 merges platform config on top of the base config.

#### C3. Platform-Specific Bundle Contents

| Resource | Linux | Windows |
|----------|-------|---------|
| agent/dist/ | bundle | bundle |
| agent/node_modules/ | bundle | bundle |
| node binary | system PATH / nvm / Flatpak | node.exe bundled in resources/ |
| openclaw/ | system (~/.naia/) or Flatpak | WSL distro (Tier 2) |
| wsl rootfs | N/A | naia-wsl-rootfs.tar.gz (Tier 2) |

#### C4–C5: macOS signing / Steam distribution → separate issues

> macOS signing and Steam distribution are tracked in their own GitHub issues.

---

### D. Windows WSL Integration Detail

#### D1. Shell Rust — WSL management functions (NEW code)

```rust
// New module: src/wsl.rs

#[cfg(target_os = "windows")]
pub mod wsl {
    use std::process::Command;

    /// Check if WSL2 is available and enabled
    /// Returns: Ok(true) = ready, Ok(false) = WSL installed but no distro,
    ///          Err(msg) = WSL not installed or not enabled
    pub fn check_wsl_status() -> Result<bool, String> {
        let output = Command::new("wsl").arg("--status")
            .output()
            .map_err(|_| "WSL is not installed. Install from Microsoft Store or run: wsl --install".to_string())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("not recognized") || stderr.contains("not found") {
                return Err("WSL is not installed. Windows 10 2004+ required.\nRun: wsl --install (admin PowerShell)".to_string());
            }
            return Err(format!("WSL error: {}", stderr));
        }
        Ok(true)
    }

    /// Check if WSL2 is available (simple bool wrapper)
    pub fn is_wsl_available() -> bool {
        check_wsl_status().unwrap_or(false)
    }

    /// Check if NaiaEnv distro is registered
    pub fn is_distro_registered(name: &str) -> bool {
        Command::new("wsl").args(["-l", "-q"])
            .output()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout);
                stdout.lines().any(|l| l.trim().trim_matches('\0') == name)
            })
            .unwrap_or(false)
    }

    /// Import custom distro from tar.gz
    pub fn import_distro(name: &str, install_path: &str, tar_path: &str) -> Result<(), String> {
        let output = Command::new("wsl")
            .args(["--import", name, install_path, tar_path, "--version", "2"])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() { Ok(()) }
        else { Err(String::from_utf8_lossy(&output.stderr).to_string()) }
    }

    /// Run command inside WSL distro
    pub fn run_in_distro(name: &str, command: &str) -> Result<String, String> {
        let output = Command::new("wsl")
            .args(["-d", name, "--", "bash", "-lc", command])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Spawn Gateway inside WSL (returns Child)
    pub fn spawn_gateway(name: &str, port: u16) -> Result<std::process::Child, String> {
        Command::new("wsl")
            .args(["-d", name, "--", "node",
                   "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs",
                   "gateway", "run", "--bind", "loopback", "--port", &port.to_string()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())
    }

    /// Terminate WSL distro
    pub fn terminate_distro(name: &str) {
        let _ = Command::new("wsl").args(["--terminate", name]).output();
    }
}
```

#### D2. WSL Networking

```
.wslconfig (auto-generated by Shell):
  [wsl2]
  networkingMode=mirrored    # localhost reliable for WebSocket
  localhostForwarding=true
  memory=8GB                 # configurable in Settings UI

Gateway binds to 0.0.0.0:18789 inside WSL.
Shell connects to ws://localhost:18789 from Windows host.
Mirrored networking ensures reliable long-lived WebSocket.

Hyper-V firewall rule (one-time, during setup):
  Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-...}' -DefaultInboundAction Allow
```

#### D3. GPU / Local LLM in WSL

```
NVIDIA CUDA in WSL2:
  - Windows GPU driver automatically exposes libcuda.so stub in WSL
  - No additional installation needed in WSL
  - Performance: 95%+ of native Linux for LLM inference
  - Supported: Pascal (GTX 10xx) and newer

AMD ROCm in WSL2:
  - Beta support (RX 7000 only, Win11 only)
  - Significantly worse than NVIDIA
  - Recommendation: NVIDIA strongly preferred for WSL AI workloads

Ollama setup in WSL distro:
  curl -fsSL https://ollama.com/install.sh | sh
  systemctl enable --now ollama
  # Accessible from Windows at http://localhost:11434
```

---

### E–F: macOS / SteamOS → separate issues

> macOS-specific (E1–E4) and SteamOS-specific (F1–F3) items are tracked in their
> own GitHub issues. The cross-platform foundation (Phase 1 items A1–A5, B1) already
> covers what's needed for future platform extensibility.

---

## Summary: Changes by Priority

### Must Do (P0) — Build breaks without these

| # | Component | Location | Change |
|---|-----------|----------|--------|
| 1 | Rust | is_pid_alive() | /proc → libc::kill(pid,0) for Unix, Windows API for Windows |
| 2 | Rust | cleanup_orphan_processes() | Entire function #[cfg(unix)] gate + Windows no-op |
| 3 | Rust | spawn_gateway() | pkill: #[cfg(unix)] gate + Windows alternative |
| 4 | Rust | spawn_gateway() + tests (4 sites) | Command::new("true"): platform gate |
| 5 | Rust | 10 functions (see A4) | HOME → dirs::home_dir() helper fn |
| 6 | Rust | Cargo.toml | Add `dirs = "5"` + `[target.'cfg(windows)'.dependencies] windows-sys` |
| 7 | Rust | find_node/find_openclaw/load_bootstrap/spawn_agent (5 sites) | Flatpak paths: #[cfg(linux)] gate |
| 8 | Agent | tool-bridge.ts (2 sites) | process.env.HOME → homedir() |
| 9 | Agent | memo.ts (1 site) | process.env.HOME → homedir() |
| 10 | Agent | notify-config.ts (1 site) | process.env.HOME → homedir() |
| 11 | Config + Rust | tauri.conf.json + lib.rs setup | Unify identifier to `io.nextain.naia` + data migration (old config dir → new) |
| 12 | Config | tauri.conf.json → tauri.conf.linux.json | Extract Linux targets (deb/rpm/appimage) from base config |
| 13 | Config | tauri.conf.windows.json | New file: NSIS/MSI targets, node.exe resource |
| 14 | CI | release-app.yml | Refactor: shared build-frontend + build-windows job |
| 15 | CI | build-windows job | Windows runner: download frontend-dist + cargo tauri build (agent has no native modules — shared build OK) |
| 16 | Rust | spawn_gateway() | Windows Tier 1: early return without find_openclaw_paths() (avoid confusing error) |
| 17 | Rust | ensure_openclaw_config() + sync_openclaw_config() | #[cfg(unix)] gate or Tier check — skip on Windows Tier 1 |

### Should Do (P1) — Full feature parity

| # | Component | Location | Change |
|---|-----------|----------|--------|
| 18 | Rust | NEW wsl.rs | WSL management module (with install guide UX) |
| 19 | Rust | spawn_gateway() | Gateway spawn: WSL bridge for Tier 2 |
| 20 | Rust | find_node_binary() | Node.js discovery: bundled node.exe, NVM for Windows, fnm |
| 21 | Rust | find_openclaw_paths() | WSL-aware OpenClaw path resolution for Tier 2 |
| 22 | CI | release-app.yml | build-wsl-distro job |
| 23 | CI | release-app.yml | MSIX packaging (makeappx.exe + signtool.exe) for MS Store |
| 24 | Config | .wslconfig template | WSL resource config (mirrored networking, memory) |
| 25 | Shell UI | Settings | Tier 1 → Tier 2 upgrade flow (WSL install guide + NaiaEnv import) |

### Nice to Have (P2) — Enhanced experience

| # | Component | Change |
|---|-----------|--------|
| 26 | Agent | fs-based fallback for read/write/search (no Gateway) — Tier 1 enhancement |
| 27 | Agent | Flatpak detection: add `process.platform === "linux"` guard |
| 28 | Rust | Test code: #[cfg(unix)] gate on Unix-only tests |

### Total: 17 P0 + 8 P1 + 3 P2 = 28 items (Windows-only scope)

---

## Execution Phases

> Each sub-phase has a **checkpoint** — a concrete verification step to confirm
> the sub-phase is complete before moving on. Do NOT proceed to the next sub-phase
> until the checkpoint passes.

### Phase 1: Cross-platform foundation (P0 items 1–17)

> These changes enable the codebase to compile and run on Windows.
> Designed to not break existing Linux and to be extensible for future platforms.

#### Phase 1a: Deps + Config (items 6, 11, 12, 13)

- Add `dirs = "5"` + `[target.'cfg(windows)'.dependencies] windows-sys` to Cargo.toml
- Unify identifier to `io.nextain.naia` in tauri.conf.json + Flatpak D-Bus permission
- Add data migration logic (old `com.naia.shell` config dir → new `io.nextain.naia`)
- Extract Linux targets → `tauri.conf.linux.json`
- Create `tauri.conf.windows.json`

**Checkpoint 1a**:
- `cargo check --manifest-path shell/src-tauri/Cargo.toml` passes on Linux (new deps resolve)
- `pnpm run tauri build --config src-tauri/tauri.conf.linux.json` produces deb/rpm/appimage
- Existing Linux Flatpak build still works (identifier change requires Flatpak manifest sync)
- Windows cross-compile deferred to Phase 1e (CI)

#### Phase 1b: Rust platform abstraction (items 1–5, 7)

- `home_dir()` helper → replace 10× `env::var("HOME")`
- `is_pid_alive()` → `#[cfg(unix)]` + `#[cfg(windows)]`
- `cleanup_orphan_processes()` → `#[cfg(unix)]` gate + Windows no-op
- `spawn_gateway()` → pkill + Command::new("true") platform gates
- Flatpak paths → `#[cfg(target_os = "linux")]` gate (5 sites)

**Checkpoint 1b**:
- `cargo test --manifest-path shell/src-tauri/Cargo.toml` passes on Linux (no regression)
- `cargo check --target x86_64-pc-windows-msvc` passes (if cross-compile toolchain available)
- `pnpm run tauri dev` on Linux — app starts, Gateway spawns, chat works
- Full Windows compile verification deferred to Phase 1e (CI)

#### Phase 1c: Agent fixes (items 8–10)

- `tool-bridge.ts` (2 sites), `memo.ts`, `notify-config.ts` — `process.env.HOME` → `homedir()`

**Checkpoint 1c**:
- `cd agent && pnpm test` passes
- `cd agent && pnpm exec tsc --noEmit` passes
- Linux `pnpm run tauri dev` — cron, memo, notify still work

#### Phase 1d: Windows Tier 1 flow (items 16–17)

- `spawn_gateway()` — Windows Tier 1 early return (skip find_openclaw_paths)
- `ensure_openclaw_config()` + `sync_openclaw_config()` — skip on Windows Tier 1

**Checkpoint 1d**:
- `cargo test` on Linux — no regression
- `cargo check --target x86_64-pc-windows-msvc` passes (if cross-compile toolchain available)
- Full Windows verification deferred to Phase 1e (CI build + manual install test)

#### Phase 1e: CI pipeline (items 14–15)

- Refactor: shared `build-frontend` job
- Add `build-windows` job (windows-latest)

**Checkpoint 1e**:
- CI `build-linux` still produces artifacts (AppImage, DEB, RPM)
- CI `build-flatpak` still produces Flatpak (independent job, unaffected)
- CI `build-windows` produces NSIS installer (.exe)
- Download Windows installer → install on Windows → app window opens
- Tier 1 chat works IF user has Node.js 22+ in PATH
  (bundled node.exe discovery is Phase 2a — without it, agent needs system Node.js)

---

### Phase 2: Windows distribution (P1 items 18–25)

#### Phase 2a: Bundled Node.js (item 20)

- `find_node_binary()` — bundled node.exe, NVM for Windows, fnm paths

**Checkpoint 2a**:
- Windows: app finds bundled node.exe without system Node.js installed
- Linux: no regression (existing search order unchanged)

#### Phase 2b: WSL integration (items 18–19, 21, 24)

- `wsl.rs` module — WSL availability check, NaiaEnv import, run_in_distro
- Gateway WSL bridge (`spawn_gateway()` Tier 2 path)
- `find_openclaw_paths()` — WSL-aware resolution
- `.wslconfig` template generation

**Checkpoint 2b**:
- Windows + WSL2: Tier 2 upgrade flow works (WSL detected, NaiaEnv importable)
- Windows + WSL2 + NaiaEnv: Gateway spawns in WSL, WebSocket connects, chat + tools work
- Windows without WSL: Tier 1 mode, clear "WSL not installed" message in Settings

#### Phase 2c: Store distribution (items 22–23, 25)

- MSIX packaging (makeappx.exe + signtool.exe)
- build-wsl-distro CI job
- Settings UI: Tier 1 → Tier 2 upgrade flow

**Checkpoint 2c**:
- MSIX installs via sideload (unsigned/self-signed for testing)
- WSL rootfs tar.gz builds in CI
- Settings UI shows upgrade button, guides user through WSL + NaiaEnv setup

---

### Phase 3: Nice to Have (P2 items 26–28)

- Agent fs-based fallback (no Gateway)
- Flatpak detection platform guard
- Test code `#[cfg(unix)]` gate

**Checkpoint 3**: Agent tests pass, no regressions
