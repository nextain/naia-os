use std::process::Command;

/// Resolve agent-browser binary path: PATH first, then ~/.cargo/bin fallback.
fn agent_browser_bin() -> Option<String> {
    // 1. Try PATH
    if let Ok(output) = Command::new("which").arg("agent-browser").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    // 2. ~/.cargo/bin fallback
    if let Ok(home) = std::env::var("HOME") {
        let fallback = format!("{}/.cargo/bin/agent-browser", home);
        if std::path::Path::new(&fallback).exists() {
            return Some(fallback);
        }
    }
    None
}

/// Run agent-browser with given args. Returns trimmed stdout on success.
fn run_browser_cmd(args: &[&str]) -> Result<String, String> {
    let bin = agent_browser_bin().ok_or_else(|| {
        "agent-browser not found. Install: cargo install agent-browser".to_string()
    })?;
    let output = Command::new(&bin)
        .args(args)
        .output()
        .map_err(|e| format!("agent-browser exec error: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Returns true if agent-browser is available on the system.
#[tauri::command]
pub fn browser_check() -> bool {
    agent_browser_bin().is_some()
}

/// Open a URL in the agent-browser daemon.
#[tauri::command]
pub fn browser_navigate(url: String) -> Result<(), String> {
    run_browser_cmd(&["open", &url]).map(|_| ())
}

/// Take a screenshot, save to a temp file, return the absolute file path.
///
/// Risk: agent-browser `screenshot` output flag may differ from `--output`.
/// Verify against actual agent-browser docs/version when binary is available.
#[tauri::command]
pub fn browser_screenshot() -> Result<String, String> {
    let path = std::env::temp_dir().join("naia-browser-shot.png");
    let path_str = path.to_string_lossy().to_string();
    run_browser_cmd(&["screenshot", "--output", &path_str])?;
    Ok(path_str)
}

/// Get accessibility tree snapshot (interactive elements only, JSON).
#[tauri::command]
pub fn browser_snapshot() -> Result<String, String> {
    run_browser_cmd(&["snapshot", "-i", "--json"])
}

/// Get current page URL and title (via `get url` + `get title`).
#[tauri::command]
pub fn browser_page_info() -> Result<(String, String), String> {
    let url = run_browser_cmd(&["get", "url"]).unwrap_or_default();
    let title = run_browser_cmd(&["get", "title"]).unwrap_or_default();
    Ok((url, title))
}

/// Navigate back.
#[tauri::command]
pub fn browser_back() -> Result<(), String> {
    run_browser_cmd(&["back"]).map(|_| ())
}

/// Navigate forward.
#[tauri::command]
pub fn browser_forward() -> Result<(), String> {
    run_browser_cmd(&["forward"]).map(|_| ())
}

/// Reload current page.
#[tauri::command]
pub fn browser_reload() -> Result<(), String> {
    run_browser_cmd(&["reload"]).map(|_| ())
}
