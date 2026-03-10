//! WSL2 management for Windows Tier 2.
//! This module is only compiled on Windows (gated by platform/mod.rs).

use std::process::Command;

/// Check if WSL2 is available and enabled.
/// Returns: Ok(true) = ready, Err(msg) = WSL not installed or not enabled.
pub(crate) fn check_wsl_status() -> Result<bool, String> {
    let mut cmd = Command::new("wsl");
    cmd.arg("--status");
    super::hide_console(&mut cmd);
    let output = cmd.output().map_err(|_| {
        "WSL is not installed. Install from Microsoft Store or run: wsl --install".to_string()
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not recognized") || stderr.contains("not found") {
            return Err(
                "WSL is not installed. Windows 10 2004+ required.\nRun: wsl --install (admin PowerShell)"
                    .to_string(),
            );
        }
        return Err(format!("WSL error: {}", stderr));
    }
    Ok(true)
}

/// Check if WSL2 is available (simple bool wrapper).
pub(crate) fn is_wsl_available() -> bool {
    check_wsl_status().unwrap_or(false)
}

/// Check if a named distro is registered in WSL.
pub(crate) fn is_distro_registered(name: &str) -> bool {
    let mut cmd = Command::new("wsl");
    cmd.args(["-l", "-q"]);
    super::hide_console(&mut cmd);
    cmd.output()
        .map(|o| {
            let stdout = decode_utf16_lossy(&o.stdout);
            stdout
                .lines()
                .any(|l| l.trim() == name)
        })
        .unwrap_or(false)
}

/// Decode potentially UTF-16LE output from wsl.exe.
/// Falls back to UTF-8 if the byte length is odd or decoding fails.
fn decode_utf16_lossy(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes.len() % 2 == 0 {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        // Strip BOM if present
        let start = if u16s.first() == Some(&0xFEFF) { 1 } else { 0 };
        String::from_utf16_lossy(&u16s[start..])
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

/// Import a custom WSL2 distro from a tar.gz rootfs.
pub(crate) fn import_distro(name: &str, install_path: &str, tar_path: &str) -> Result<(), String> {
    let mut cmd = Command::new("wsl");
    cmd.args(["--import", name, install_path, tar_path, "--version", "2"]);
    super::hide_console(&mut cmd);
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("HCS_E_SERVICE_NOT_AVAILABLE") || stderr.contains("0x80070422") {
            Err("WSL requires a system restart to finish setup. Please restart your computer and try again.".to_string())
        } else {
            Err(stderr.to_string())
        }
    }
}

/// Run a command inside a named WSL distro and return stdout.
#[allow(dead_code)]
pub(crate) fn run_in_distro(name: &str, command: &str) -> Result<String, String> {
    let mut cmd = Command::new("wsl");
    cmd.args(["-d", name, "--", "bash", "-lc", command]);
    super::hide_console(&mut cmd);
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Spawn OpenClaw Gateway inside a WSL distro (returns a Child handle).
pub(crate) fn spawn_gateway_in_wsl(
    name: &str,
    port: u16,
) -> Result<std::process::Child, String> {
    let mut cmd = Command::new("wsl");
    cmd.args([
        "-d",
        name,
        "--",
        "node",
        "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs",
        "gateway",
        "run",
        "--bind",
        "loopback",
        "--port",
        &port.to_string(),
        "--allow-unconfigured",
    ])
    .stdin(std::process::Stdio::null())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());
    super::hide_console(&mut cmd);
    cmd.spawn().map_err(|e| e.to_string())
}

/// Spawn OpenClaw Node Host inside a WSL distro (returns a Child handle).
pub(crate) fn spawn_node_host_in_wsl(
    name: &str,
    port: u16,
) -> Result<std::process::Child, String> {
    let mut cmd = Command::new("wsl");
    cmd.args([
        "-d",
        name,
        "--",
        "node",
        "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs",
        "node",
        "run",
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "--display-name",
        "NaiaLocal",
    ])
    .stdin(std::process::Stdio::null())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());
    super::hide_console(&mut cmd);
    cmd.spawn().map_err(|e| e.to_string())
}

/// Auto-approve pending device pairing requests in the WSL Gateway.
/// Parses `openclaw devices list` CLI output to find pending request UUIDs,
/// then approves each one so the Agent can connect without manual intervention.
pub(crate) fn auto_approve_pending_devices(name: &str) {
    let mut cmd = Command::new("wsl");
    cmd.args([
        "-d", name, "--",
        "node",
        "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs",
        "devices", "list",
    ]);
    super::hide_console(&mut cmd);
    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return,
    };
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse pending section — extract UUIDs from table rows
    // Format: │ <uuid> │ <deviceId> │ ...
    let mut in_pending = false;
    let mut request_ids = Vec::new();

    for line in stdout.lines() {
        if line.contains("Pending") {
            in_pending = true;
            continue;
        }
        if line.contains("Paired") {
            in_pending = false;
            continue;
        }
        if in_pending {
            // Extract UUID (8-4-4-4-12 hex) from table cell
            let trimmed = line.trim().trim_start_matches('│').trim();
            if let Some(uuid) = extract_uuid(trimmed) {
                request_ids.push(uuid);
            }
        }
    }

    for request_id in &request_ids {
        crate::log_both(&format!(
            "[Naia] Auto-approving pending device: {}",
            request_id
        ));
        let mut approve_cmd = Command::new("wsl");
        approve_cmd.args([
            "-d", name, "--",
            "node",
            "/opt/naia/openclaw/node_modules/openclaw/openclaw.mjs",
            "devices", "approve", request_id,
        ]);
        super::hide_console(&mut approve_cmd);
        let _ = approve_cmd.output();
    }

    if !request_ids.is_empty() {
        crate::log_both(&format!(
            "[Naia] Auto-approved {} pending device(s)",
            request_ids.len()
        ));
    }
}

/// Extract a UUID (8-4-4-4-12 hex pattern) from a string.
fn extract_uuid(s: &str) -> Option<String> {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
    let bytes = s.as_bytes();
    if bytes.len() < 36 {
        return None;
    }
    for start in 0..=bytes.len().saturating_sub(36) {
        let candidate = &s[start..start + 36];
        let parts: Vec<&str> = candidate.split('-').collect();
        if parts.len() == 5
            && parts[0].len() == 8
            && parts[1].len() == 4
            && parts[2].len() == 4
            && parts[3].len() == 4
            && parts[4].len() == 12
            && candidate.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Kill OpenClaw processes (gateway + node host) running inside a WSL distro.
/// This ensures the `node` processes inside WSL are actually terminated,
/// not just the `wsl.exe` bridge on Windows.
pub(crate) fn kill_openclaw_processes(name: &str) {
    let mut cmd = Command::new("wsl");
    cmd.args(["-d", name, "--", "pkill", "-f", "openclaw"]);
    super::hide_console(&mut cmd);
    match cmd.output() {
        Ok(o) => {
            if o.status.success() {
                crate::log_verbose(&format!(
                    "[Naia] Killed OpenClaw processes inside WSL distro '{}'",
                    name
                ));
            }
            // pkill returns 1 if no processes matched — that's fine
        }
        Err(e) => {
            crate::log_verbose(&format!(
                "[Naia] Failed to pkill inside WSL '{}': {}",
                name, e
            ));
        }
    }
}

/// Terminate a WSL distro.
#[allow(dead_code)]
pub(crate) fn terminate_distro(name: &str) {
    let mut cmd = Command::new("wsl");
    cmd.args(["--terminate", name]);
    super::hide_console(&mut cmd);
    let _ = cmd.output();
}
