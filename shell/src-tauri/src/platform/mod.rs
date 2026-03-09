//! Platform abstraction layer.
//!
//! All platform-specific code lives here — lib.rs has zero `#[cfg]` attributes.
//! Each platform module exports the same set of functions, re-exported by this facade.

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
    Spawned { child: Child },
    /// Platform has no special handling — use default flow.
    UseDefault,
}
