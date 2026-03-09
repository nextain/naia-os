/// WSL2 management for Windows Tier 2.
/// Only compiled on Windows — all functions are behind #[cfg(target_os = "windows")].

#[cfg(target_os = "windows")]
use std::process::Command;

/// Check if WSL2 is available and enabled.
/// Returns: Ok(true) = ready, Err(msg) = WSL not installed or not enabled.
#[cfg(target_os = "windows")]
pub fn check_wsl_status() -> Result<bool, String> {
    let output = Command::new("wsl")
        .arg("--status")
        .output()
        .map_err(|_| {
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
#[cfg(target_os = "windows")]
pub fn is_wsl_available() -> bool {
    check_wsl_status().unwrap_or(false)
}

/// Check if a named distro is registered in WSL.
#[cfg(target_os = "windows")]
pub fn is_distro_registered(name: &str) -> bool {
    Command::new("wsl")
        .args(["-l", "-q"])
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout
                .lines()
                .any(|l| l.trim().trim_matches('\0') == name)
        })
        .unwrap_or(false)
}

/// Import a custom WSL2 distro from a tar.gz rootfs.
#[cfg(target_os = "windows")]
pub fn import_distro(name: &str, install_path: &str, tar_path: &str) -> Result<(), String> {
    let output = Command::new("wsl")
        .args(["--import", name, install_path, tar_path, "--version", "2"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Run a command inside a named WSL distro and return stdout.
#[cfg(target_os = "windows")]
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

/// Spawn OpenClaw Gateway inside a WSL distro (returns a Child handle).
#[cfg(target_os = "windows")]
pub fn spawn_gateway_in_wsl(
    name: &str,
    port: u16,
) -> Result<std::process::Child, String> {
    Command::new("wsl")
        .args([
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
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())
}

/// Terminate a WSL distro.
#[cfg(target_os = "windows")]
pub fn terminate_distro(name: &str) {
    let _ = Command::new("wsl")
        .args(["--terminate", name])
        .output();
}
