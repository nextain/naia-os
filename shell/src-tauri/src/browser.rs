use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

use crate::{log_both, log_verbose};

const BROWSER_LABEL: &str = "browser-inner";

static CACHED_URL: OnceLock<Mutex<String>> = OnceLock::new();
static CACHED_TITLE: OnceLock<Mutex<String>> = OnceLock::new();

fn cached_url() -> &'static Mutex<String> {
    CACHED_URL.get_or_init(|| Mutex::new(String::new()))
}
fn cached_title() -> &'static Mutex<String> {
    CACHED_TITLE.get_or_init(|| Mutex::new(String::new()))
}

// ─── Child WebView Commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn browser_init(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    log_verbose(&format!("[Browser] browser_init: x={x} y={y} w={width} h={height}"));
    // Already initialized
    if app.get_webview(BROWSER_LABEL).is_some() {
        log_verbose("[Browser] browser_init: already initialized, skipping");
        return Ok(());
    }

    let win = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let app_nav = app.clone();
    let app_load = app.clone();

    win.add_child(
        WebviewBuilder::new(
            BROWSER_LABEL,
            WebviewUrl::External("about:blank".parse().unwrap()),
        )
        .on_navigation(move |url| {
            let s = url.to_string();
            *cached_url().lock().unwrap() = s.clone();
            let _ = app_nav.emit("browser-url-changed", s);
            true // allow navigation
        })
        .on_page_load(move |wv, payload| {
            use tauri::webview::PageLoadEvent;
            if payload.event() == PageLoadEvent::Finished {
                let url = payload.url().to_string();
                *cached_url().lock().unwrap() = url.clone();
                let _ = app_load.emit("browser-url-changed", &url);
                // Inject title observer
                let app2 = app_load.clone();
                let _ = wv.eval(&format!(
                    r#"(function(){{
                        var t = document.title || '';
                        window.__naia_report_title(t);
                        var obs = new MutationObserver(function(){{
                            window.__naia_report_title(document.title||'');
                        }});
                        var el = document.querySelector('title');
                        if(el) obs.observe(el,{{childList:true,subtree:true}});
                    }})();"#
                ));
                let _ = app2.emit("browser-title-changed", document_title_placeholder(&url));
            }
        }),
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    )
    .map_err(|e| {
        log_both(&format!("[Browser] browser_init failed: {e}"));
        format!("Failed to create browser webview: {e}")
    })?;

    log_verbose("[Browser] browser_init: child webview created");
    Ok(())
}

/// Derive a readable title from URL as fallback.
fn document_title_placeholder(url: &str) -> String {
    url.parse::<url::Url>()
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| url.to_string())
}

#[tauri::command]
pub fn browser_set_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.set_bounds(tauri::Rect {
            position: tauri::Position::Logical(LogicalPosition::new(x, y)),
            size: tauri::Size::Logical(LogicalSize::new(width, height)),
        })
        .map_err(|e| format!("set_bounds failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, url: String) -> Result<(), String> {
    log_verbose(&format!("[Browser] browser_navigate: {url}"));
    let wv = app
        .get_webview(BROWSER_LABEL)
        .ok_or_else(|| "browser not initialized".to_string())?;
    let parsed: url::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;
    wv.navigate(parsed).map_err(|e| {
        log_both(&format!("[Browser] navigate failed: {e}"));
        format!("navigate failed: {e}")
    })
}

#[tauri::command]
pub fn browser_show(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.show().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_hide(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.hide().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_back(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.eval("window.history.back()").map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_forward(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.eval("window.history.forward()").map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_reload(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        wv.eval("location.reload()").map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_page_info() -> Result<(String, String), String> {
    Ok((
        cached_url().lock().unwrap().clone(),
        cached_title().lock().unwrap().clone(),
    ))
}
