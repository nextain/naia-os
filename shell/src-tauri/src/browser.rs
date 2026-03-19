//! Chrome subprocess embedding for the Naia browser panel.
//!
//! Architecture:
//!   Chrome (--ozone-platform=x11, --remote-debugging-port=<port>)
//!     ├── X11 window embedded into Tauri via XReparentWindow (Linux/XWayland)
//!     └── CDP endpoint → agent-browser connect <port> (AI interface)
//!
//! Platform support:
//!   Linux (X11 / XWayland):  full embedding via x11rb
//!   macOS / Windows / Wayland-only: NOT YET SUPPORTED (planned Phase 2)
//!
//! Constraint: Tauri app MUST be launched with GDK_BACKEND=x11 (XWayland mode)
//! for XReparentWindow to work.  When running under a pure Wayland surface the
//! embed will fail gracefully and callers receive an Err.

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// ─── Global state ─────────────────────────────────────────────────────────────

struct ChromeState {
    process: Option<Child>,
    port: u16,
    chrome_xid: u32,
    tmpdir: String,
    pid: u32,
}

impl ChromeState {
    const fn new() -> Self {
        Self {
            process: None,
            port: 0,
            chrome_xid: 0,
            tmpdir: String::new(),
            pid: 0,
        }
    }
}

/// Spawn a background thread that:
/// 1. Watches Chrome's PID → emits `browser_closed` if it exits unexpectedly.
/// 2. Guards tabs via CDP REST → opens a new tab if all tabs are closed
///    (works together with `--keep-alive-for-test` which prevents Chrome from
///    exiting when the last tab is closed).
fn spawn_chrome_monitor(app: AppHandle, pid: u32, port: u16) {
    std::thread::spawn(move || {
        let list_url = format!("http://127.0.0.1:{port}/json/list");
        let new_tab_url = format!("http://127.0.0.1:{port}/json/new");
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Check if process is still alive (kill -0 equivalent)
            let alive = unsafe { libc::kill(pid as i32, 0) == 0 };
            if !alive {
                // Clear state
                if let Ok(mut state) = CHROME.lock() {
                    if state.pid == pid {
                        state.process = None;
                        state.chrome_xid = 0;
                        state.port = 0;
                        state.pid = 0;
                    }
                }
                let _ = app.emit("browser_closed", ());
                break;
            }

            // Tab guard: if all page tabs are closed, open a new one
            if let Ok(resp) = ureq::get(&list_url).call() {
                if let Ok(body) = resp.into_string() {
                    // Simple check: count "type":"page" entries
                    if !body.contains("\"page\"") {
                        let _ = ureq::get(&new_tab_url).call();
                    }
                }
            }
        }
    });
}

static CHROME: Mutex<ChromeState> = Mutex::new(ChromeState::new());

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Find a free TCP port by binding to port 0.
fn find_free_port() -> u16 {
    use std::net::TcpListener;
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(19222)
}

/// Resolve `google-chrome` or `chromium` binary.
fn chrome_bin() -> Option<String> {
    for name in &["google-chrome", "chromium", "chromium-browser"] {
        if let Ok(out) = Command::new("which").arg(name).output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Resolve `agent-browser` binary (PATH → ~/.config/nvm fallback).
fn agent_browser_bin() -> Option<String> {
    if let Ok(out) = Command::new("which").arg("agent-browser").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    // nvm-managed node puts binaries under ~/.config/nvm
    if let Ok(home) = std::env::var("HOME") {
        for suffix in &[
            ".config/nvm/versions/node",
            ".nvm/versions/node",
        ] {
            let base = format!("{home}/{suffix}");
            if let Ok(mut dirs) = std::fs::read_dir(&base) {
                // Take first (latest) node version
                if let Some(Ok(entry)) = dirs.next() {
                    let bin = entry.path().join("bin/agent-browser");
                    if bin.exists() {
                        return Some(bin.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    None
}

/// Spawn Chrome as a subprocess, X11 mode, with CDP.
fn spawn_chrome(port: u16, tmpdir: &str) -> Result<Child, String> {
    let bin = chrome_bin().ok_or("google-chrome not found in PATH")?;
    Command::new(&bin)
        .args([
            // X11 mode (required for XReparentWindow embedding)
            "--ozone-platform=x11",
            // Keep process alive even when all tabs are closed
            // (tab guard will open a new tab automatically)
            "--keep-alive-for-test",
            // Housekeeping
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-extensions",
            "--disable-infobars",
            "--disable-session-crashed-bubble",
            "--disable-dev-shm-usage",
            "--disable-gpu-sandbox",
            &format!("--remote-debugging-port={port}"),
            &format!("--user-data-dir={tmpdir}"),
        ])
        .env("DISPLAY", ":0")
        .env("GDK_BACKEND", "x11")
        // Suppress Chrome's own stdout/stderr noise
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn Chrome: {e}"))
}

/// Wait for Chrome to expose its CDP endpoint (up to 8 s).
fn wait_for_cdp(port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{port}/json/version");
    for _ in 0..16 {
        if let Ok(resp) = ureq::get(&url).call() {
            if resp.status() == 200 {
                return Ok(());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Err(format!("Chrome CDP not ready on port {port} after 8 s"))
}

/// Find Chrome's visible X11 window ID by PID (up to 6 s).
fn find_chrome_xid(pid: u32) -> Result<u32, String> {
    for _ in 0..12 {
        let out = Command::new("xdotool")
            .args(["search", "--pid", &pid.to_string()])
            .env("DISPLAY", ":0")
            .output()
            .map_err(|e| format!("xdotool error: {e}"))?;
        let ids: Vec<u32> = String::from_utf8_lossy(&out.stdout)
            .split_whitespace()
            .filter_map(|t| t.parse::<u32>().ok())
            .collect();
        if let Some(&xid) = ids.first() {
            return Ok(xid);
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Err(format!("Chrome X11 window not found for PID {pid} within 6 s"))
}

/// Find the Tauri main window's X11 window ID by window name.
///
/// Uses `xdotool search --name` instead of `--pid` because inside distrobox
/// (and some XWayland setups) the in-process PID differs from the host PID
/// stored in `_NET_WM_PID`, making --pid searches fail.
/// The window title "Naia" is fixed by tauri.conf.json.
fn find_tauri_xid() -> Result<u32, String> {
    for attempt in 0..20 {
        let out = Command::new("xdotool")
            .args(["search", "--name", "^Naia$"])
            .env("DISPLAY", ":0")
            .output()
            .map_err(|e| format!("xdotool error: {e}"))?;
        let ids: Vec<u32> = String::from_utf8_lossy(&out.stdout)
            .split_whitespace()
            .filter_map(|t| t.parse::<u32>().ok())
            .collect();
        if !ids.is_empty() {
            // Pick the window with the largest area (main app window)
            let best = ids
                .iter()
                .copied()
                .max_by_key(|&xid| window_area(xid).unwrap_or(0));
            if let Some(xid) = best {
                return Ok(xid);
            }
        }
        if attempt == 0 {
            std::thread::sleep(std::time::Duration::from_millis(1000));
        } else {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    Err("Tauri X11 window not found (title: 'Naia'). \
        Ensure the app is launched with GDK_BACKEND=x11"
        .to_string())
}

/// Return the pixel area of an X11 window (width × height), or None on error.
#[cfg(target_os = "linux")]
fn window_area(xid: u32) -> Option<u32> {
    use x11rb::protocol::xproto::*;
    use x11rb::rust_connection::RustConnection;
    let (conn, _) = RustConnection::connect(Some(":0")).ok()?;
    let geom = conn.get_geometry(xid).ok()?.reply().ok()?;
    Some(geom.width as u32 * geom.height as u32)
}

#[cfg(not(target_os = "linux"))]
fn window_area(_xid: u32) -> Option<u32> { None }

/// Embed `child_xid` into `parent_xid` at (x, y) with size (w×h) via x11rb.
#[cfg(target_os = "linux")]
fn x11_embed(parent_xid: u32, child_xid: u32, x: i16, y: i16, w: u32, h: u32) -> Result<(), String> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::*;
    use x11rb::rust_connection::RustConnection;

    let (conn, _) = RustConnection::connect(Some(":0"))
        .map_err(|e| format!("X11 connect failed: {e}"))?;

    // Set parent window background to white so no black flicker shows through
    let bg_attrs = ChangeWindowAttributesAux::new().background_pixel(0x00ffffff);
    conn.change_window_attributes(parent_xid, &bg_attrs).ok();

    // Unmap first to avoid flicker during reparent
    conn.unmap_window(child_xid)
        .map_err(|e| format!("unmap failed: {e}"))?;
    conn.flush().ok();
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Reparent into Tauri window
    conn.reparent_window(child_xid, parent_xid, x, y)
        .map_err(|e| format!("XReparentWindow failed: {e}"))?;

    // Resize to fill the panel area
    conn.configure_window(
        child_xid,
        &ConfigureWindowAux::new()
            .x(x as i32)
            .y(y as i32)
            .width(w)
            .height(h)
            .border_width(0u32),
    )
    .map_err(|e| format!("XConfigureWindow failed: {e}"))?;

    // Map (show) the window inside parent
    conn.map_window(child_xid)
        .map_err(|e| format!("XMapWindow failed: {e}"))?;

    // Give keyboard focus to Chrome immediately after embedding
    conn.set_input_focus(InputFocus::PARENT, child_xid, x11rb::CURRENT_TIME)
        .map_err(|e| format!("XSetInputFocus failed: {e}"))?;

    conn.flush()
        .map_err(|e| format!("X11 flush failed: {e}"))?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn x11_embed(_parent_xid: u32, _child_xid: u32, _x: i16, _y: i16, _w: u32, _h: u32) -> Result<(), String> {
    Err("X11 embedding is only supported on Linux".to_string())
}

/// Resize/reposition an already-embedded Chrome window via x11rb.
#[cfg(target_os = "linux")]
fn x11_resize(child_xid: u32, x: i16, y: i16, w: u32, h: u32) -> Result<(), String> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::*;
    use x11rb::rust_connection::RustConnection;

    let (conn, _) = RustConnection::connect(Some(":0"))
        .map_err(|e| format!("X11 connect: {e}"))?;
    conn.configure_window(
        child_xid,
        &ConfigureWindowAux::new().x(x as i32).y(y as i32).width(w).height(h),
    )
    .map_err(|e| format!("XConfigureWindow: {e}"))?;
    conn.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn x11_resize(_child_xid: u32, _x: i16, _y: i16, _w: u32, _h: u32) -> Result<(), String> {
    Err("X11 resize only on Linux".to_string())
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Returns true if a supported Chrome binary is available.
#[tauri::command]
pub fn browser_check() -> bool {
    chrome_bin().is_some()
}

/// Returns true if agent-browser is installed.
#[tauri::command]
pub fn browser_agent_check() -> bool {
    agent_browser_bin().is_some()
}

/// Spawn Chrome, wait for CDP, embed window into Tauri via XReparentWindow.
///
/// `x`, `y` — browser panel origin relative to Tauri window (from React getBoundingClientRect)
/// `width`, `height` — panel content area dimensions
///
/// NOTE: This is a synchronous (blocking) Tauri command intentionally.
/// It runs on Tauri's blocking thread pool (not the async executor) so it can
/// sleep while waiting for Chrome to start without blocking other async commands.
#[tauri::command]
pub fn browser_embed_init(app: AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<u16, String> {
    let state = CHROME.lock().unwrap();

    // If Chrome process already exists, re-embed (don't spawn again).
    // This handles two cases:
    //   a) chrome_xid != 0 — fully embedded, just reposition
    //   b) chrome_xid == 0 — React StrictMode detached the embed; re-attach
    // In both cases we must NOT spawn a new Chrome.
    if state.process.is_some() {
        let port = state.port;
        let pid = state.pid;
        let existing_xid = state.chrome_xid;
        drop(state);

        crate::log_verbose(&format!("[browser] re-embed: pid={pid} existing_xid={existing_xid}"));
        let chrome_xid = if existing_xid != 0 {
            existing_xid
        } else {
            find_chrome_xid(pid)?
        };
        let tauri_xid = find_tauri_xid()?;
        crate::log_verbose(&format!("[browser] re-embed: chrome_xid={chrome_xid} tauri_xid={tauri_xid}"));
        x11_embed(tauri_xid, chrome_xid, x as i16, y as i16, width as u32, height as u32)?;
        CHROME.lock().unwrap().chrome_xid = chrome_xid;
        crate::log_verbose("[browser] re-embed OK");
        return Ok(port);
    }

    crate::log_verbose("[browser] init: spawning Chrome");
    // No Chrome running — kill any lingering processes from previous sessions
    // (--keep-alive-for-test keeps Chrome alive even after app exit).
    let _ = Command::new("pkill")
        .args(["-f", "naia-chrome"])
        .output();
    std::thread::sleep(std::time::Duration::from_millis(300));

    let port = find_free_port();
    let tmpdir = std::env::temp_dir()
        .join(format!("naia-chrome-{port}"))
        .to_string_lossy()
        .to_string();
    std::fs::create_dir_all(&tmpdir)
        .map_err(|e| format!("Failed to create tmpdir: {e}"))?;

    let child = spawn_chrome(port, &tmpdir)?;
    let pid = child.id();
    crate::log_verbose(&format!("[browser] Chrome spawned: pid={pid} port={port}"));

    // Store process immediately so it's tracked even if later steps fail.
    // This prevents a second spawn if the user retries after an error.
    {
        let mut s = state; // re-use the held lock
        s.process = Some(child);
        s.port = port;
        s.tmpdir = tmpdir.clone();
        s.pid = pid;
    }

    // Wait for CDP (blocking wait)
    crate::log_verbose(&format!("[browser] waiting for CDP on port {port}..."));
    if let Err(e) = wait_for_cdp(port) {
        crate::log_both(&format!("[browser] CDP wait failed: {e}"));
        // Clean up zombie process so next retry spawns fresh
        let mut s = CHROME.lock().unwrap();
        if let Some(mut child) = s.process.take() { let _ = child.kill(); }
        s.port = 0; s.pid = 0;
        return Err(e);
    }
    crate::log_verbose("[browser] CDP ready");

    // Find Chrome's X11 window
    let chrome_xid = find_chrome_xid(pid)?;
    crate::log_verbose(&format!("[browser] chrome_xid={chrome_xid}"));

    // Find Tauri's X11 window
    crate::log_verbose("[browser] searching for Tauri window by name 'Naia'...");
    let tauri_xid = find_tauri_xid()?;
    crate::log_verbose(&format!("[browser] tauri_xid={tauri_xid}"));

    // Embed Chrome into Tauri
    x11_embed(tauri_xid, chrome_xid, x as i16, y as i16, width as u32, height as u32)?;
    crate::log_verbose(&format!("[browser] embed OK: chrome={chrome_xid} → tauri={tauri_xid}"));

    // Record the XID now that embedding succeeded
    let mut state = CHROME.lock().unwrap();
    state.chrome_xid = chrome_xid;
    drop(state);

    // Monitor Chrome process + tab guard
    spawn_chrome_monitor(app, pid, port);

    Ok(port)
}

/// Update Chrome window position/size when the panel resizes.
#[tauri::command]
pub fn browser_embed_resize(x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    let state = CHROME.lock().unwrap();
    if state.chrome_xid == 0 {
        return Ok(());
    }
    let xid = state.chrome_xid;
    drop(state);
    x11_resize(xid, x as i16, y as i16, width as u32, height as u32)
}

/// Give keyboard focus to Chrome's X11 window via XSetInputFocus.
///
/// After XReparentWindow Chrome is a *child* window, not a top-level.
/// xdotool windowfocus uses _NET_ACTIVE_WINDOW (a WM protocol for top-levels)
/// which does not reliably work on embedded child windows.
/// XSetInputFocus works at the X11 protocol level and correctly routes
/// keyboard events to the embedded Chrome window.
#[cfg(target_os = "linux")]
#[tauri::command]
pub fn browser_embed_focus() -> Result<(), String> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::*;
    use x11rb::rust_connection::RustConnection;

    let xid = {
        let state = CHROME.lock().unwrap();
        state.chrome_xid
    };
    if xid == 0 {
        return Ok(());
    }
    let (conn, _) = RustConnection::connect(Some(":0"))
        .map_err(|e| format!("X11 connect: {e}"))?;
    conn.set_input_focus(InputFocus::PARENT, xid, x11rb::CURRENT_TIME)
        .map_err(|e| format!("XSetInputFocus: {e}"))?;
    conn.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub fn browser_embed_focus() -> Result<(), String> {
    Ok(())
}

/// Run an agent-browser command against the active Chrome CDP session.
/// Uses `--cdp <port>` flag to connect to our Chrome instance.
fn run_agent_cmd(port: u16, args: &[&str]) -> Result<String, String> {
    let bin = agent_browser_bin().ok_or("agent-browser not found")?;
    let out = Command::new(&bin)
        .arg("--cdp")
        .arg(port.to_string())
        .args(args)
        .output()
        .map_err(|e| format!("agent-browser: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("agent-browser exited with status {}", out.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Navigate Chrome to a URL via CDP (using agent-browser).
#[tauri::command]
pub fn browser_embed_navigate(url: String) -> Result<(), String> {
    let port = {
        let state = CHROME.lock().unwrap();
        state.port
    };
    if port == 0 {
        return Err("Browser not initialized".to_string());
    }
    run_agent_cmd(port, &["open", &url])?;
    Ok(())
}

/// Get current page URL and title via CDP.
#[tauri::command]
pub fn browser_embed_page_info() -> Result<(String, String), String> {
    let port = {
        let state = CHROME.lock().unwrap();
        state.port
    };
    if port == 0 {
        return Ok((String::new(), String::new()));
    }
    // Use CDP /json/list to get active tab info
    let url_api = format!("http://127.0.0.1:{port}/json/list");
    let resp = ureq::get(&url_api)
        .call()
        .map_err(|e| format!("CDP /json/list: {e}"))?;
    let tabs: Vec<serde_json::Value> = resp
        .into_json()
        .map_err(|e| format!("JSON parse: {e}"))?;
    let tab = tabs
        .iter()
        .find(|t| t["type"] == "page")
        .unwrap_or(&serde_json::Value::Null);
    let page_url = tab["url"].as_str().unwrap_or("").to_string();
    let page_title = tab["title"].as_str().unwrap_or("").to_string();
    Ok((page_url, page_title))
}

/// Navigate back via CDP.
#[tauri::command]
pub fn browser_embed_back() -> Result<(), String> {
    run_cdp_nav_cmd("browser_back")
}

/// Navigate forward via CDP.
#[tauri::command]
pub fn browser_embed_forward() -> Result<(), String> {
    run_cdp_nav_cmd("browser_forward")
}

/// Reload current page via CDP.
#[tauri::command]
pub fn browser_embed_reload() -> Result<(), String> {
    run_cdp_nav_cmd("browser_reload")
}

fn run_cdp_nav_cmd(cmd: &str) -> Result<(), String> {
    let port = {
        let state = CHROME.lock().unwrap();
        state.port
    };
    if port == 0 {
        return Err("Browser not initialized".to_string());
    }
    let agent_cmd = match cmd {
        "browser_back" => "back",
        "browser_forward" => "forward",
        "browser_reload" => "reload",
        _ => return Err(format!("Unknown nav cmd: {cmd}")),
    };
    run_agent_cmd(port, &[agent_cmd])?;
    Ok(())
}

/// Detach the browser panel (called on React component unmount).
///
/// Does NOT kill Chrome — Chrome is a long-lived process managed by the
/// monitor thread. Killing here would cause React StrictMode (dev mode) to
/// spawn two Chrome instances: StrictMode unmounts→close kills Chrome #1,
/// then remounts→init spawns Chrome #2.
/// Chrome is killed by `browser_embed_kill` on actual app exit.
#[tauri::command]
pub fn browser_embed_close() -> Result<(), String> {
    let mut state = CHROME.lock().unwrap();
    state.chrome_xid = 0; // signal that embed is detached; re-embed on next init
    Ok(())
}

/// Hard-kill Chrome and clean up. Call only on app exit.
pub fn browser_embed_kill() {
    let mut state = CHROME.lock().unwrap();
    if let Some(mut child) = state.process.take() {
        let _ = child.kill();
    }
    let tmpdir = std::mem::take(&mut state.tmpdir);
    state.port = 0;
    state.chrome_xid = 0;
    state.pid = 0;
    if !tmpdir.is_empty() {
        let _ = std::fs::remove_dir_all(&tmpdir);
    }
}

/// Return the active Chrome CDP port (0 if not running).
#[tauri::command]
pub fn browser_embed_port() -> u16 {
    CHROME.lock().unwrap().port
}

/// Return accessibility tree snapshot of the current page (for Naia AI).
///
/// Returns a text representation of the page's interactive elements,
/// with @ref IDs that can be used for click/fill commands.
#[tauri::command]
pub fn browser_snapshot() -> Result<String, String> {
    let port = CHROME.lock().unwrap().port;
    if port == 0 {
        return Err("Browser not initialized".to_string());
    }
    run_agent_cmd(port, &["snapshot"])
}

/// Click an element identified by an @ref from snapshot output (for Naia AI).
#[tauri::command]
pub fn browser_click(selector: String) -> Result<(), String> {
    let port = CHROME.lock().unwrap().port;
    if port == 0 {
        return Err("Browser not initialized".to_string());
    }
    run_agent_cmd(port, &["click", &selector])?;
    Ok(())
}

/// Fill (clear + type) an input element identified by @ref (for Naia AI).
#[tauri::command]
pub fn browser_fill(selector: String, text: String) -> Result<(), String> {
    let port = CHROME.lock().unwrap().port;
    if port == 0 {
        return Err("Browser not initialized".to_string());
    }
    run_agent_cmd(port, &["fill", &selector, &text])?;
    Ok(())
}

/// Get inner text of an element (or full page body if selector empty) (for Naia AI).
#[tauri::command]
pub fn browser_get_text(selector: String) -> Result<String, String> {
    let port = CHROME.lock().unwrap().port;
    if port == 0 {
        return Err("Browser not initialized".to_string());
    }
    if selector.is_empty() {
        run_agent_cmd(port, &["get", "text", "body"])
    } else {
        run_agent_cmd(port, &["get", "text", &selector])
    }
}
