//! Linux/Unix platform implementations.

use std::path::PathBuf;
use std::process::{Child, Command};

/// Check if a process with the given PID is still running (Unix: kill(pid, 0)).
pub(crate) fn is_pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// Spawn a no-op child process (Unix: /bin/true).
pub(crate) fn dummy_child() -> Result<Child, String> {
    Command::new("true")
        .spawn()
        .map_err(|e| format!("Failed to create dummy process: {}", e))
}

/// Suppress console window (Unix: no-op — Unix processes don't create console windows).
pub(crate) fn hide_console(_cmd: &mut Command) {}

/// Clean up orphan processes from a previous session (Unix: SIGTERM → SIGKILL).
pub(crate) fn cleanup_orphan_processes() {
    for component in &["gateway", "node-host"] {
        if let Some(pid) = crate::read_pid_file(component) {
            let signed_pid = match i32::try_from(pid) {
                Ok(p) if p > 0 => p,
                _ => {
                    crate::log_verbose(&format!(
                        "[Naia] Invalid PID {} for {} — skipping",
                        pid, component
                    ));
                    crate::remove_pid_file(component);
                    continue;
                }
            };
            if is_pid_alive(pid) {
                crate::log_verbose(&format!(
                    "[Naia] Orphan {} found (PID {}) — sending SIGTERM",
                    component, pid
                ));
                unsafe {
                    libc::kill(signed_pid, libc::SIGTERM);
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
                if is_pid_alive(pid) {
                    crate::log_verbose(&format!(
                        "[Naia] Orphan {} still alive (PID {}) — sending SIGKILL",
                        component, pid
                    ));
                    unsafe {
                        libc::kill(signed_pid, libc::SIGKILL);
                    }
                }
            }
            crate::remove_pid_file(component);
        }
    }
}

/// Kill stale gateway process (Unix: pkill -f).
pub(crate) fn kill_stale_gateway() {
    let _ = Command::new("pkill")
        .arg("-f")
        .arg("openclaw.*gateway")
        .output();
}

/// Find Node.js via Unix version managers (nvm).
pub(crate) fn find_node_version_manager(home: &str) -> Option<PathBuf> {
    let nvm_dirs = [
        format!("{}/.nvm/versions/node", home),
        format!("{}/.config/nvm/versions/node", home),
    ];
    for nvm_dir in &nvm_dirs {
        if let Some(path) = crate::find_highest_node_version(nvm_dir, "bin/node") {
            return Some(path);
        }
    }
    None
}

/// Find bundled node binary (Linux: not applicable).
pub(crate) fn find_bundled_node(_app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    None
}

/// Platform-specific gateway spawn (Linux: use default flow).
pub(crate) fn try_platform_gateway_spawn() -> super::GatewaySpawnResult {
    super::GatewaySpawnResult::UseDefault
}

/// Get platform tier info (Linux: always Tier 2 equivalent — full feature set).
pub(crate) fn get_platform_tier_info() -> serde_json::Value {
    serde_json::json!({
        "platform": std::env::consts::OS,
        "tier": 2,
        "wsl": false,
        "distro": false
    })
}

/// Auto-setup WSL (Linux: not applicable — return error).
pub(crate) fn setup_wsl_environment(_app_handle: &tauri::AppHandle) -> Result<String, String> {
    Err("WSL setup is only available on Windows".to_string())
}

/// Kill OpenClaw processes inside WSL (Linux: no-op — no WSL on Linux).
pub(crate) fn kill_wsl_openclaw_processes() {}

/// Whether to skip OpenClaw config sync (Linux: never skip).
pub(crate) fn should_skip_openclaw_sync() -> bool {
    false
}

/// Resolve `npx` command name (Linux: just "npx").
pub(crate) fn resolve_npx() -> String {
    "npx".to_string()
}

/// Start deep link file watcher (Linux: no-op — single-instance IPC works).
pub(crate) fn start_deep_link_file_watcher(_app_handle: tauri::AppHandle) {}

/// Normalize a path (Linux: no-op, no extended-length prefix issues).
pub(crate) fn normalize_path(path: &std::path::Path) -> PathBuf {
    path.to_path_buf()
}

/// Configure WebView settings (Linux: WebKit GPU/permissions).
pub(crate) fn configure_webview(app: &tauri::App) {
    use tauri::Manager;
    use webkit2gtk::glib::object::ObjectExt;
    use webkit2gtk::PermissionRequestExt;

    if let Some(webview_window) = app.get_webview_window("main") {
        let _ = webview_window.with_webview(|webview| {
            use webkit2gtk::WebViewExt;
            webview
                .inner()
                .connect_permission_request(|_, request| {
                    if request.is::<webkit2gtk::UserMediaPermissionRequest>() {
                        request.allow();
                    } else {
                        request.deny();
                    }
                    true
                });
        });
    }
}
