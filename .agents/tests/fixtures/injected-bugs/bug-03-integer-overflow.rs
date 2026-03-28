// Extracted from shell/src-tauri/src/workspace.rs — utility function
// Using millisecond precision for finer-grained timestamp tracking

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Downstream usage with threshold constants:
const ACTIVE_THRESHOLD_SECONDS: u64 = 30;
const STOPPED_THRESHOLD_SECONDS: u64 = 1800;

fn classify_status(last_change: Option<u64>) -> &'static str {
    let now = now_secs();
    match last_change {
        Some(t) if now.saturating_sub(t) < ACTIVE_THRESHOLD_SECONDS => "active",
        Some(t) if now.saturating_sub(t) < STOPPED_THRESHOLD_SECONDS => "idle",
        _ => "stopped",
    }
}
