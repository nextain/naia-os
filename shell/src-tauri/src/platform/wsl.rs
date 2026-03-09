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
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout
                .lines()
                .any(|l| l.trim().trim_matches('\0') == name)
        })
        .unwrap_or(false)
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
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Run a command inside a named WSL distro and return stdout.
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
    ])
    .stdin(std::process::Stdio::null())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());
    super::hide_console(&mut cmd);
    cmd.spawn().map_err(|e| e.to_string())
}

/// Terminate a WSL distro.
pub(crate) fn terminate_distro(name: &str) {
    let mut cmd = Command::new("wsl");
    cmd.args(["--terminate", name]);
    super::hide_console(&mut cmd);
    let _ = cmd.output();
}
