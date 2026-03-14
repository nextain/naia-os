//! Windows platform implementations.

use std::path::PathBuf;
use std::process::{Child, Command};

/// Check if a process with the given PID is still running (Windows: OpenProcess + GetExitCodeProcess).
pub(crate) fn is_pid_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess};
    let handle = unsafe { OpenProcess(0x0400, 0, pid) }; // PROCESS_QUERY_INFORMATION
    if handle.is_null() {
        return false; // OpenProcess returns NULL HANDLE on failure
    }
    let mut exit_code: u32 = 0;
    let alive = unsafe {
        GetExitCodeProcess(handle, &mut exit_code) != 0 && exit_code == 259 // STILL_ACTIVE
    };
    unsafe { CloseHandle(handle) };
    alive
}

/// Spawn a no-op child process (Windows: cmd /C echo.).
pub(crate) fn dummy_child() -> Result<Child, String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "echo."]);
    hide_console(&mut cmd);
    cmd.spawn()
        .map_err(|e| format!("Failed to create dummy process: {}", e))
}

/// Suppress the visible console window that GUI-spawned processes would otherwise show.
pub(crate) fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

/// Clean up orphan processes from a previous session (Windows: TerminateProcess).
pub(crate) fn cleanup_orphan_processes() {
    for component in &["gateway", "node-host"] {
        if let Some(pid) = crate::read_pid_file(component) {
            if is_pid_alive(pid) {
                crate::log_verbose(&format!(
                    "[Naia] Orphan {} found (PID {}) — terminating",
                    component, pid
                ));
                let handle = unsafe {
                    windows_sys::Win32::System::Threading::OpenProcess(0x0001, 0, pid)
                    // PROCESS_TERMINATE
                };
                if !handle.is_null() {
                    unsafe {
                        windows_sys::Win32::System::Threading::TerminateProcess(handle, 1);
                        windows_sys::Win32::Foundation::CloseHandle(handle);
                    }
                }
            }
            crate::remove_pid_file(component);
        }
    }
}

/// Kill stale gateway process (Windows: no-op — gateway runs in WSL or is externally managed).
pub(crate) fn kill_stale_gateway() {
    crate::log_verbose(
        "[Naia] Windows: skipping pkill (gateway runs in WSL or is externally managed)",
    );
}

/// Kill OpenClaw processes inside WSL (gateway + node host).
/// On Windows, killing `wsl.exe` does NOT kill the `node` process inside WSL.
pub(crate) fn kill_wsl_openclaw_processes() {
    if super::wsl::is_distro_registered("NaiaEnv") {
        super::wsl::kill_openclaw_processes("NaiaEnv");
    }
}

/// Find Node.js via Windows version managers (NVM for Windows, fnm).
pub(crate) fn find_node_version_manager(_home: &str) -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let nvm_win_dir = format!("{}/nvm", appdata);
    if let Some(path) = crate::find_highest_node_version(&nvm_win_dir, "node.exe") {
        return Some(path);
    }
    let fnm_dir = format!("{}/fnm/node-versions", appdata);
    if let Some(path) = crate::find_highest_node_version(&fnm_dir, "installation/node.exe") {
        return Some(path);
    }
    None
}

/// Well-known Node.js install paths (GUI apps may not inherit updated PATH).
pub(crate) fn find_node_well_known_paths() -> Option<PathBuf> {
    let well_known = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ];
    for candidate in &well_known {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Platform npm command name (Windows: npm.cmd because npm is a cmd script).
pub(crate) fn npm_command() -> &'static str {
    "npm.cmd"
}

/// Find bundled node.exe in Tauri resources (Windows only).
pub(crate) fn find_bundled_node(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let bundled_node = normalize_path(&resource_dir.join("node.exe"));
        if bundled_node.exists() {
            crate::log_verbose(&format!(
                "[Naia] Found bundled node.exe at: {}",
                bundled_node.display()
            ));
            return Some(bundled_node);
        }
    }
    None
}

/// Platform-specific gateway spawn (Windows: WSL Tier 2 or Tier 1 skip).
pub(crate) fn try_platform_gateway_spawn() -> super::GatewaySpawnResult {
    const DISTRO_NAME: &str = "NaiaEnv";
    if !super::wsl::is_wsl_available() || !super::wsl::is_distro_registered(DISTRO_NAME) {
        return super::GatewaySpawnResult::Skip {
            reason: "Windows Tier 1 mode — Gateway skipped (WSL/NaiaEnv not found)".to_string(),
        };
    }
    // Tier 2: WSL + NaiaEnv available
    if !crate::check_gateway_health_sync() {
        crate::log_both("[Naia] Windows Tier 2 — spawning Gateway in WSL (NaiaEnv)");
        match super::wsl::spawn_gateway_in_wsl(DISTRO_NAME, 18789) {
            Ok(child) => {
                // Wait for Gateway to become healthy (max 60s, same as Linux path)
                crate::log_verbose("[Naia] Waiting for WSL Gateway health check (max 60s)...");
                let mut gateway_healthy = false;
                for i in 0..60 {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    if crate::check_gateway_health_sync() {
                        crate::log_both(&format!(
                            "[Naia] WSL Gateway healthy after {}s",
                            i + 1
                        ));
                        gateway_healthy = true;
                        break;
                    }
                    if (i + 1) % 10 == 0 {
                        crate::log_verbose(&format!(
                            "[Naia] Still waiting for WSL Gateway... ({}s elapsed)",
                            i + 1
                        ));
                    }
                }
                // Auto-approve pending device pairings so Agent can connect
                if gateway_healthy {
                    super::wsl::auto_approve_pending_devices(DISTRO_NAME);
                    sync_wsl_identity_to_windows(DISTRO_NAME);
                }

                // Spawn Node Host only after Gateway is healthy
                let node_host = if gateway_healthy {
                    match super::wsl::spawn_node_host_in_wsl(DISTRO_NAME, 18789) {
                        Ok(nh) => {
                            crate::log_both("[Naia] Node Host spawned in WSL (NaiaEnv)");
                            // Give Node Host time to connect
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            Some(nh)
                        }
                        Err(e) => {
                            crate::log_both(&format!("[Naia] Node Host spawn failed: {}", e));
                            None
                        }
                    }
                } else {
                    crate::log_both("[Naia] WSL Gateway not healthy after 60s — skipping Node Host");
                    None
                };
                super::GatewaySpawnResult::Spawned { child, node_host }
            }
            Err(e) => {
                crate::log_both(&format!("[Naia] WSL Gateway spawn failed: {}", e));
                super::GatewaySpawnResult::Skip {
                    reason: format!("WSL Gateway spawn failed: {}", e),
                }
            }
        }
    } else {
        // Gateway already running (e.g. WSL systemd or previous app session) — reuse with WSL Node Host
        crate::log_both("[Naia] Windows Tier 2 — Gateway already running, reusing");
        super::wsl::auto_approve_pending_devices(DISTRO_NAME);
        sync_wsl_identity_to_windows(DISTRO_NAME);
        let node_host = match super::wsl::spawn_node_host_in_wsl(DISTRO_NAME, 18789) {
            Ok(nh) => {
                crate::log_both("[Naia] Node Host spawned in WSL (NaiaEnv) for reused Gateway");
                std::thread::sleep(std::time::Duration::from_secs(2));
                Some(nh)
            }
            Err(e) => {
                crate::log_both(&format!("[Naia] Node Host spawn failed (reuse path): {}", e));
                None
            }
        };
        match crate::platform::dummy_child() {
            Ok(child) => super::GatewaySpawnResult::Spawned { child, node_host },
            Err(e) => {
                crate::log_both(&format!("[Naia] dummy_child failed: {}", e));
                super::GatewaySpawnResult::Skip {
                    reason: format!("Gateway reuse failed: {}", e),
                }
            }
        }
    }
}

/// Get platform tier info (Windows: check WSL/NaiaEnv).
pub(crate) fn get_platform_tier_info() -> serde_json::Value {
    let wsl_available = super::wsl::is_wsl_available();
    let distro_registered = wsl_available && super::wsl::is_distro_registered("NaiaEnv");
    let tier = if distro_registered { 2 } else { 1 };
    serde_json::json!({
        "platform": "windows",
        "tier": tier,
        "wsl": wsl_available,
        "distro": distro_registered
    })
}

/// Emit a progress event to the frontend during WSL setup.
fn emit_setup_progress(app: &tauri::AppHandle, step: &str, detail: &str) {
    use tauri::Emitter;
    let payload = serde_json::json!({ "step": step, "detail": detail });
    let _ = app.emit("wsl-setup-progress", payload);
    crate::log_both(&format!("[Naia] WSL setup: {} — {}", step, detail));
}

/// Run `wsl --update` with UAC elevation to install/update the WSL2 kernel.
/// This handles the case where WSL features are enabled but the kernel is missing
/// (e.g. fresh Windows install, or feature enabled without kernel download).
fn update_wsl_kernel_elevated() -> Result<(), String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile", "-Command",
        "Start-Process wsl.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '--update'",
    ]);
    hide_console(&mut cmd);
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            crate::log_both(&format!("[Naia] wsl --update completed: {}", stdout.trim()));
            Ok(())
        }
        Err(e) => Err(format!("Failed to run wsl --update: {}", e)),
    }
}

/// Run the PowerShell UAC elevation script to enable WSL features.
/// Returns Ok(()) on success, Err on failure.
fn enable_wsl_features_elevated() -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("naia-wsl-enable.ps1");
    let ps_script = concat!(
        "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -ErrorAction SilentlyContinue | Out-Null\n",
        "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -ErrorAction SilentlyContinue | Out-Null\n",
    );
    if let Err(e) = std::fs::write(&script_path, ps_script) {
        return Err(format!("Failed to write WSL enable script: {}", e));
    }

    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile", "-Command",
        &format!(
            "Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'",
            script_path.display()
        ),
    ]);
    hide_console(&mut cmd);
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            crate::log_both(&format!("[Naia] WSL feature enable completed: {}", stdout.trim()));
            let _ = std::fs::remove_file(&script_path);
            Ok(())
        }
        Err(e) => {
            let _ = std::fs::remove_file(&script_path);
            Err(format!("Failed to enable WSL features: {}", e))
        }
    }
}

/// Auto-setup WSL + NaiaEnv distro. Called from frontend setup wizard.
/// Steps: 1) Install WSL  2) .wslconfig  3) Install Ubuntu + create NaiaEnv  4) Provision
/// Returns JSON progress/tier info.
pub(crate) fn setup_wsl_environment(app_handle: &tauri::AppHandle) -> Result<String, String> {
    // Step 1: Enable WSL Windows features if not available.
    // Use wsl --version as the primary check (fast, no VM boot).
    // The VMP feature check via PowerShell may fail in app contexts that lack
    // elevation, so we only use it as a "definitely disabled" guard.
    if !super::wsl::is_wsl_available() {
        // Distinguish between "features disabled", "kernel missing", and "pending reboot".
        let wsl_err = super::wsl::check_wsl_status().unwrap_err();
        crate::log_both(&format!("[Naia] WSL not available: {}", wsl_err));

        // Case 1: WSL2 kernel not installed (features enabled, vmcompute exists, but no kernel)
        // This happens on fresh Windows installs or after WSL feature enable without wsl --update.
        if wsl_err.contains("kernel") || wsl_err.contains("커널") || wsl_err.contains("wsl --update") {
            emit_setup_progress(app_handle, "wsl_kernel", "Installing WSL2 kernel...");
            crate::log_both("[Naia] WSL2 kernel missing — running wsl --update with elevation");
            update_wsl_kernel_elevated()?;

            // Re-check after kernel install
            std::thread::sleep(std::time::Duration::from_secs(3));
            if !super::wsl::is_wsl_available() {
                return Err("WSL2 kernel installed. Please restart your computer and reopen Naia to complete setup.".to_string());
            }
            crate::log_both("[Naia] WSL2 kernel installed successfully — continuing setup");
        } else {
            // Case 2: Features disabled or pending
            let vmp_state = super::wsl::get_windows_feature_state("VirtualMachinePlatform");
            let wsl_state = super::wsl::get_windows_feature_state("Microsoft-Windows-Subsystem-Linux");
            crate::log_both(&format!(
                "[Naia] Feature states — VMP: {:?}, WSL: {:?}",
                vmp_state, wsl_state
            ));

            let vmp_disabled = vmp_state.as_deref() == Some("Disabled");
            let wsl_disabled = wsl_state.as_deref() == Some("Disabled");
            let vmp_pending = vmp_state.as_deref() == Some("EnablePending");
            let wsl_pending = wsl_state.as_deref() == Some("EnablePending");

            if vmp_pending || wsl_pending {
                return Err("WSL installed successfully! Please restart your computer and reopen Naia to complete setup.".to_string());
            }

            if vmp_disabled || wsl_disabled {
                emit_setup_progress(app_handle, "wsl", "Installing WSL...");
                crate::log_both("[Naia] WSL features need enabling");
                enable_wsl_features_elevated()?;
                return Err("WSL installed successfully! Please restart your computer and reopen Naia to complete setup.".to_string());
            }

            // Case 3: Feature state unknown (None) — last resort
            std::thread::sleep(std::time::Duration::from_secs(2));
            if !super::wsl::is_wsl_available() {
                // Try kernel update first (more common issue than features missing)
                emit_setup_progress(app_handle, "wsl_kernel", "Installing WSL2 kernel...");
                crate::log_both("[Naia] WSL not available, unknown reason — trying wsl --update");
                if update_wsl_kernel_elevated().is_ok() {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    if super::wsl::is_wsl_available() {
                        crate::log_both("[Naia] WSL available after kernel update");
                    } else {
                        // Kernel update wasn't enough, try enabling features
                        emit_setup_progress(app_handle, "wsl", "Installing WSL...");
                        enable_wsl_features_elevated()?;
                        return Err("WSL installed successfully! Please restart your computer and reopen Naia to complete setup.".to_string());
                    }
                } else {
                    emit_setup_progress(app_handle, "wsl", "Installing WSL...");
                    enable_wsl_features_elevated()?;
                    return Err("WSL installed successfully! Please restart your computer and reopen Naia to complete setup.".to_string());
                }
            }
        }
    }

    // Step 2: Copy .wslconfig to %USERPROFILE%
    if let Some(home) = dirs::home_dir() {
        let wslconfig_dest = home.join(".wslconfig");
        if !wslconfig_dest.exists() {
            let template_content = include_str!("../../../../config/defaults/wslconfig-template");
            if let Err(e) = std::fs::write(&wslconfig_dest, template_content) {
                crate::log_both(&format!("[Naia] Failed to write .wslconfig: {}", e));
            } else {
                crate::log_both(&format!("[Naia] .wslconfig written to {}", wslconfig_dest.display()));
            }
        }
    }

    // Step 3: Create NaiaEnv distro by downloading Ubuntu rootfs and importing directly.
    // Previous approach (wsl --install + export + import) was unreliable:
    // - wsl --install sometimes reports "already installed" without actually registering
    // - export fails with WSL_E_DISTRO_NOT_FOUND on uninitialized distros
    // Direct rootfs download + import is more reliable and avoids the intermediate distro.
    if !super::wsl::is_distro_registered("NaiaEnv") {
        crate::log_both("[Naia] NaiaEnv not found — downloading Ubuntu rootfs");

        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        let wsl_dir = home.join(".naia").join("wsl");
        let _ = std::fs::create_dir_all(&wsl_dir);
        let rootfs_path = wsl_dir.join("ubuntu-rootfs.tar.gz");
        let install_dir = wsl_dir.join("NaiaEnv");
        let _ = std::fs::create_dir_all(&install_dir);

        // 3a: Download Ubuntu 24.04 rootfs if not already cached
        if !rootfs_path.exists() || std::fs::metadata(&rootfs_path).map(|m| m.len()).unwrap_or(0) < 100_000_000 {
            emit_setup_progress(app_handle, "ubuntu", "Downloading Ubuntu 24.04...");
            crate::log_both("[Naia] Downloading Ubuntu 24.04 rootfs...");
            let rootfs_url = "https://cdimage.ubuntu.com/ubuntu-wsl/noble/daily-live/current/noble-wsl-amd64.wsl";
            let mut curl_cmd = Command::new("curl.exe");
            curl_cmd.args(["-L", "-o", &rootfs_path.to_string_lossy(), rootfs_url]);
            hide_console(&mut curl_cmd);
            let dl_output = curl_cmd.output().map_err(|e| format!("Download failed: {}", e))?;
            if !dl_output.status.success() {
                let stderr = String::from_utf8_lossy(&dl_output.stderr);
                return Err(format!("Ubuntu rootfs download failed: {}", stderr));
            }
            // Verify download size (should be ~370MB+)
            let dl_size = std::fs::metadata(&rootfs_path).map(|m| m.len()).unwrap_or(0);
            if dl_size < 100_000_000 {
                let _ = std::fs::remove_file(&rootfs_path);
                return Err(format!("Ubuntu rootfs download too small ({}B) — likely failed", dl_size));
            }
            crate::log_both(&format!("[Naia] Ubuntu rootfs downloaded ({}MB)", dl_size / 1_000_000));
        } else {
            crate::log_both("[Naia] Ubuntu rootfs already cached, skipping download");
        }

        // 3b: Verify Hyper-V Compute Service is available before import.
        // wsl --import hangs indefinitely if HCS is not running (VMP feature
        // enabled but not yet active after reboot).
        {
            let mut sc_cmd = Command::new("sc.exe");
            sc_cmd.args(["query", "vmcompute"]);
            hide_console(&mut sc_cmd);
            let sc_ok = sc_cmd.output().map(|o| o.status.success()).unwrap_or(false);
            if !sc_ok {
                crate::log_both("[Naia] HCS (vmcompute) service not available — reboot required");
                return Err("WSL installed successfully! Please restart your computer and reopen Naia to complete setup.".to_string());
            }
        }

        // 3c: Import rootfs directly as NaiaEnv
        emit_setup_progress(app_handle, "import", "Creating NaiaEnv distro...");
        crate::log_both("[Naia] Importing rootfs as NaiaEnv...");
        super::wsl::import_distro(
            "NaiaEnv",
            &install_dir.to_string_lossy(),
            &rootfs_path.to_string_lossy(),
        )?;

        crate::log_both("[Naia] NaiaEnv distro created");

        // Restart WSL to apply .wslconfig
        let mut cmd = Command::new("wsl");
        cmd.arg("--shutdown");
        hide_console(&mut cmd);
        let _ = cmd.output();
        std::thread::sleep(std::time::Duration::from_secs(2));
    }

    // Step 4: Provision NaiaEnv (install Node.js + OpenClaw if missing)
    if super::wsl::is_distro_registered("NaiaEnv") {
        if !super::wsl::is_provisioned("NaiaEnv") {
            emit_setup_progress(app_handle, "provision", "Installing Node.js + OpenClaw (2~5 min)...");
            crate::log_both("[Naia] Provisioning NaiaEnv (Node.js + OpenClaw)...");
            super::wsl::provision_distro("NaiaEnv", Some(app_handle))?;
            crate::log_both("[Naia] NaiaEnv provisioned successfully");
        } else {
            crate::log_both("[Naia] NaiaEnv already provisioned");
        }
        let tier_info = get_platform_tier_info();
        Ok(tier_info.to_string())
    } else {
        Err("NaiaEnv distro creation failed — not registered after setup".to_string())
    }
}

/// Copy device identity and auth token from WSL NaiaEnv to Windows-side `~/.openclaw/`.
/// Without this, agent-core on Windows cannot complete the Gateway WebSocket handshake
/// (Gateway requires device identity even with --allow-unconfigured).
pub(crate) fn sync_wsl_identity_to_windows(distro_name: &str) {
    let home = crate::home_dir();
    let identity_dir = format!("{}/.openclaw/identity", home);
    let _ = std::fs::create_dir_all(&identity_dir);

    // Copy device.json from WSL
    match super::wsl::run_in_distro(distro_name, "cat /root/.openclaw/identity/device.json 2>/dev/null") {
        Ok(content) if !content.trim().is_empty() => {
            let dest = format!("{}/device.json", identity_dir);
            match std::fs::write(&dest, content.trim()) {
                Ok(_) => crate::log_both("[Naia] Device identity synced from WSL to Windows"),
                Err(e) => crate::log_verbose(&format!("[Naia] Failed to write device.json: {}", e)),
            }
        }
        _ => crate::log_verbose("[Naia] No device identity found in WSL (may not be paired yet)"),
    }

    // Copy openclaw.json (auth token, gateway config)
    let config_dir = format!("{}/.openclaw", home);
    let _ = std::fs::create_dir_all(&config_dir);
    match super::wsl::run_in_distro(distro_name, "cat /root/.openclaw/openclaw.json 2>/dev/null") {
        Ok(content) if !content.trim().is_empty() => {
            let dest = format!("{}/openclaw.json", config_dir);
            match std::fs::write(&dest, content.trim()) {
                Ok(_) => crate::log_both("[Naia] OpenClaw config synced from WSL to Windows"),
                Err(e) => crate::log_verbose(&format!("[Naia] Failed to write openclaw.json: {}", e)),
            }
        }
        _ => crate::log_verbose("[Naia] No openclaw.json found in WSL"),
    }
}

/// Whether to skip OpenClaw config sync (Windows: always skip — config lives in WSL).
pub(crate) fn should_skip_openclaw_sync() -> bool {
    true
}

/// Configure WebView settings (Windows: no special configuration needed).
pub(crate) fn configure_webview(_app: &tauri::App) {
    // WebView2 on Windows doesn't need special configuration
}

/// Resolve `npx` to `npx.cmd` on Windows (Rust's Command doesn't search .cmd extensions).
pub(crate) fn resolve_npx() -> String {
    "npx.cmd".to_string()
}

/// Start a background thread that watches for deep link URLs written to a
/// pending file by a second instance (see main.rs).  This is needed because
/// Chromium browsers launch the protocol handler in a sandboxed context where
/// the single-instance Named Mutex IPC fails silently.
pub(crate) fn start_deep_link_file_watcher(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let pending_path = dirs::home_dir()
            .map(|h| h.join(".naia").join("deep-link-pending.txt"))
            .unwrap_or_else(|| PathBuf::from(r"C:\Users\Public\.naia\deep-link-pending.txt"));
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if pending_path.exists() {
                if let Ok(raw) = std::fs::read_to_string(&pending_path) {
                    let _ = std::fs::remove_file(&pending_path);
                    let url_str = raw.trim();
                    if !url_str.is_empty() {
                        crate::process_deep_link_url(url_str, &app_handle, None, "file");
                    }
                }
            }
        }
    });
    crate::log_both("[Naia] Deep link file watcher started");
}

/// Normalize a Windows path by stripping the `\\?\` extended-length prefix.
/// Node.js and many tools can't handle `\\?\` paths. Tauri's `resource_dir()`
/// and `canonicalize()` produce these on Windows.
pub(crate) fn normalize_path(path: &std::path::Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}
