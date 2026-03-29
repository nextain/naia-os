//! Platform abstraction layer.
//!
//! All platform-specific code lives here — lib.rs has zero `#[cfg]` attributes.
//! Each platform module exports the same set of functions, re-exported by this facade.
//!
//! Browser embedding uses `PlatformWindowManager` trait — each platform implements
//! window discovery, embedding, focus, and visibility using native APIs.

#[cfg(unix)]
mod linux;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub(crate) mod wsl;

#[cfg(unix)]
pub(crate) use linux::*;
#[cfg(windows)]
pub(crate) use windows::*;

use std::process::Child;

/// Result of platform-specific gateway spawn attempt.
pub(crate) enum GatewaySpawnResult {
    /// Platform says skip gateway entirely (e.g. Windows Tier 1).
    Skip { reason: String },
    /// Platform spawned the gateway itself (e.g. Windows Tier 2 via WSL).
    Spawned { child: Child, node_host: Option<Child> },
    /// Platform has no special handling — use default flow.
    UseDefault,
}

// ─── Browser window embedding abstraction ────────────────────────────────────

/// Platform-native window handle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformHandle {
    #[cfg(target_os = "linux")]
    X11(u32),
    #[cfg(target_os = "windows")]
    Win32(isize),
    None,
}

impl PlatformHandle {
    pub fn is_valid(&self) -> bool { !matches!(self, PlatformHandle::None) }
    pub fn is_none(&self) -> bool { matches!(self, PlatformHandle::None) }
}

impl Default for PlatformHandle {
    fn default() -> Self { PlatformHandle::None }
}

/// Geometry rectangle for window positioning (all coordinates in pixels, i32).
#[derive(Debug, Clone, Copy)]
pub struct WindowRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl WindowRect {
    pub fn from_f64(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self { x: x as i32, y: y as i32, width: width as u32, height: height as u32 }
    }
}

/// Platform-specific window embedding operations.
pub trait PlatformWindowManager: Send + Sync {
    fn find_window_by_pid(&self, pid: u32, timeout_ms: u64) -> Result<PlatformHandle, String>;
    fn find_window_by_name(&self, name: &str, timeout_ms: u64) -> Result<PlatformHandle, String>;
    fn embed(&self, parent: PlatformHandle, child: PlatformHandle, rect: WindowRect) -> Result<(), String>;
    fn remap(&self, handle: PlatformHandle, rect: WindowRect) -> Result<(), String>;
    fn resize(&self, handle: PlatformHandle, rect: WindowRect) -> Result<(), String>;
    fn focus(&self, handle: PlatformHandle) -> Result<(), String>;
    fn show(&self, handle: PlatformHandle) -> Result<(), String>;
    fn hide(&self, handle: PlatformHandle) -> Result<(), String>;
    fn chrome_bin(&self) -> Option<String>;
    fn chrome_spawn_args(&self) -> (Vec<String>, Vec<(String, String)>);
    fn kill_lingering_chrome(&self);
}

/// Get the platform-specific window manager singleton.
pub fn window_manager() -> &'static dyn PlatformWindowManager {
    #[cfg(target_os = "linux")]
    { static INSTANCE: linux::X11WindowManager = linux::X11WindowManager; &INSTANCE }
    #[cfg(target_os = "windows")]
    { static INSTANCE: windows::Win32WindowManager = windows::Win32WindowManager; &INSTANCE }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    { compile_error!("Unsupported platform — implement PlatformWindowManager for this OS"); }
}
