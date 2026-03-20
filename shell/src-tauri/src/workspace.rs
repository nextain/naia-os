use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub dir: String,
    pub path: String,
    pub branch: Option<String>,
    pub status: String, // "active" | "idle" | "stopped"
    pub progress: Option<ProgressInfo>,
    pub recent_file: Option<String>,
    pub last_change: Option<u64>, // Unix timestamp seconds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressInfo {
    pub issue: Option<String>,
    pub phase: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInfo {
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifiedDir {
    pub name: String,
    pub path: String,
    pub category: String, // "project" | "worktree" | "reference" | "docs" | "other"
}

// ─── Watcher State ────────────────────────────────────────────────────────────

pub struct WatcherState {
    pub watcher: Option<RecommendedWatcher>,
    /// Maps directory path → last change timestamp (seconds since epoch)
    pub last_change: Arc<Mutex<HashMap<String, u64>>>,
    /// Maps directory path → most recently changed file (relative path)
    pub recent_files: Arc<Mutex<HashMap<String, String>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: None,
            last_change: Arc::new(Mutex::new(HashMap::new())),
            recent_files: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ─── Shared watcher handle managed by AppState ───────────────────────────────
pub type SharedWatcherState = Arc<Mutex<WatcherState>>;

pub fn new_shared_watcher() -> SharedWatcherState {
    Arc::new(Mutex::new(WatcherState::new()))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

fn get_branch(path: &Path) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output()
        .ok()?;
    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !branch.is_empty() && branch != "HEAD" {
            return Some(branch);
        }
        // detached HEAD — get short commit hash
        let output2 = std::process::Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .current_dir(path)
            .output()
            .ok()?;
        if output2.status.success() {
            let hash = String::from_utf8_lossy(&output2.stdout).trim().to_string();
            return Some(format!("(HEAD {})", hash));
        }
    }
    None
}

/// Reads the first `.agents/progress/*.json` in the given directory.
fn read_progress(session_path: &Path) -> Option<ProgressInfo> {
    let progress_dir = session_path.join(".agents").join("progress");
    let entries = std::fs::read_dir(&progress_dir).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = std::fs::read_to_string(&p) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    return Some(ProgressInfo {
                        issue: val["issue"].as_str().map(|s| s.to_string()),
                        phase: val["current_phase"].as_str().map(|s| s.to_string()),
                        title: val["title"].as_str().map(|s| s.to_string()),
                    });
                }
            }
        }
    }
    None
}

/// Classifies a directory by heuristic rules.
/// Rules (in priority order):
///   1. Has `.git` file (not dir) → worktree
///   2. Name starts with `ref-` → reference
///   3. Name starts with `docs-` → docs
///   4. Has `.git` dir → project
///   5. else → other
fn classify_dir_heuristic(path: &Path) -> &'static str {
    let git_path = path.join(".git");
    if git_path.is_file() {
        return "worktree";
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.starts_with("ref-") {
        return "reference";
    }
    if name.starts_with("docs-") {
        return "docs";
    }
    if git_path.is_dir() {
        return "project";
    }
    "other"
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Lists top-level directories under the given path.
/// If `parent` is `None`, defaults to WORKSPACE_ROOT (`/var/home/luke/dev`).
#[tauri::command]
pub fn workspace_list_dirs(parent: Option<String>) -> Result<Vec<DirEntry>, String> {
    let root = parent.unwrap_or_else(|| "/var/home/luke/dev".to_string());
    let root_path = PathBuf::from(&root);
    let mut entries: Vec<DirEntry> = Vec::new();

    let read = std::fs::read_dir(&root_path).map_err(|e| e.to_string())?;
    let mut raw: Vec<_> = read.flatten().collect();
    raw.sort_by_key(|e| e.file_name());

    for e in raw {
        let path = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        // Skip hidden dirs/files at root level (except we keep them for nested)
        let is_dir = path.is_dir();
        entries.push(DirEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children: None, // lazy expansion
        });
    }

    Ok(entries)
}

/// Reads a file and returns its content as a string.
#[tauri::command]
pub fn workspace_read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Writes content to a file, creating parent directories as needed.
#[tauri::command]
pub fn workspace_write_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content).map_err(|e| e.to_string())
}

/// Returns git branch for a directory.
#[tauri::command]
pub fn workspace_get_git_info(path: String) -> GitInfo {
    let p = PathBuf::from(&path);
    GitInfo {
        branch: get_branch(&p),
    }
}

/// Scans WORKSPACE_ROOT for git-repo subdirectories and returns session info.
#[tauri::command]
pub fn workspace_get_sessions(
    watcher: tauri::State<'_, SharedWatcherState>,
) -> Result<Vec<SessionInfo>, String> {
    let root = PathBuf::from("/var/home/luke/dev");
    let mut sessions = Vec::new();

    let read = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
    // Clone the Arc handles while holding the outer lock once (avoids double-lock deadlock)
    let (last_change_map, recent_files_map) = {
        let state = watcher.lock().unwrap();
        (state.last_change.clone(), state.recent_files.clone())
    };
    let lc = last_change_map.lock().unwrap();
    let rf = recent_files_map.lock().unwrap();

    let now = now_secs();

    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !is_git_repo(&path) {
            continue;
        }
        let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let path_str = path.to_string_lossy().to_string();

        let last_change = lc.get(&path_str).copied();
        let recent_file = rf.get(&path_str).cloned();
        let branch = get_branch(&path);
        let progress = read_progress(&path);

        let status = match last_change {
            Some(t) if now.saturating_sub(t) < 30 => "active",
            Some(t) if now.saturating_sub(t) < 1800 => "idle",
            Some(_) => "stopped",
            None => "idle",
        };

        sessions.push(SessionInfo {
            dir: dir_name,
            path: path_str,
            branch,
            status: status.to_string(),
            progress,
            recent_file,
            last_change,
        });
    }

    sessions.sort_by(|a, b| {
        b.last_change.unwrap_or(0).cmp(&a.last_change.unwrap_or(0))
    });

    Ok(sessions)
}

/// Reads all `.agents/progress/*.json` files in the given session directory.
#[tauri::command]
pub fn workspace_get_progress(path: String) -> Option<ProgressInfo> {
    read_progress(Path::new(&path))
}

/// Starts file watching for all git-repo subdirectories of WORKSPACE_ROOT.
/// Emits `workspace:file-changed` Tauri event on any file change.
#[tauri::command]
pub fn workspace_start_watch(
    app: AppHandle,
    watcher_state: tauri::State<'_, SharedWatcherState>,
) -> Result<(), String> {
    let root = PathBuf::from("/var/home/luke/dev");
    let mut state = watcher_state.lock().unwrap();

    if state.watcher.is_some() {
        // Already watching
        return Ok(());
    }

    let last_change_clone = state.last_change.clone();
    let recent_files_clone = state.recent_files.clone();
    let app_clone = app.clone();

    let watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            if let Ok(event) = result {
                // Filter: only track file modifications/creations, skip metadata-only
                let is_content_change = matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_)
                );
                if !is_content_change {
                    return;
                }

                for changed_path in &event.paths {
                    // Skip hidden files and lock files
                    let name = changed_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    if name.starts_with('.') || name.ends_with(".lock") {
                        continue;
                    }
                    if !changed_path.is_file() {
                        continue;
                    }

                    // Determine which session dir this belongs to
                    // Session dir is the direct child of /var/home/luke/dev
                    if let Some(session_dir) = find_session_dir(changed_path) {
                        let session_str = session_dir.to_string_lossy().to_string();
                        let now = now_secs();

                        // Compute relative path within session
                        let rel = changed_path
                            .strip_prefix(&session_dir)
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|_| name.to_string());

                        {
                            let mut lc = last_change_clone.lock().unwrap();
                            lc.insert(session_str.clone(), now);
                        }
                        {
                            let mut rf = recent_files_clone.lock().unwrap();
                            rf.insert(session_str.clone(), rel.clone());
                        }

                        let _ = app_clone.emit("workspace:file-changed", serde_json::json!({
                            "session": session_str,
                            "file": rel,
                            "timestamp": now,
                        }));
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    let mut w = watcher;

    // Watch all git-repo subdirectories
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && is_git_repo(&path) {
                let _ = w.watch(&path, RecursiveMode::Recursive);
            }
        }
    }

    state.watcher = Some(w);
    Ok(())
}

/// Stops the file watcher.
#[tauri::command]
pub fn workspace_stop_watch(
    watcher_state: tauri::State<'_, SharedWatcherState>,
) -> Result<(), String> {
    let mut state = watcher_state.lock().unwrap();
    state.watcher = None; // dropping watcher stops it
    Ok(())
}

/// Classifies all git-repo (and other) subdirectories of WORKSPACE_ROOT.
#[tauri::command]
pub fn workspace_classify_dirs() -> Result<Vec<ClassifiedDir>, String> {
    let root = PathBuf::from("/var/home/luke/dev");
    let mut result = Vec::new();

    // Get list of worktree paths using `git worktree list` from the root
    let worktree_paths: Vec<String> = get_all_worktree_paths(&root);

    let read = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
    let mut raw: Vec<_> = read.flatten().collect();
    raw.sort_by_key(|e| e.file_name());

    for entry in raw {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        // Skip hidden dirs
        if name.starts_with('.') {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();

        // Check if this dir is a worktree according to git worktree list
        let is_worktree_listed = worktree_paths.contains(&path_str);

        let category = if is_worktree_listed {
            // If it's in worktree list AND has a .git file, it's a worktree
            if path.join(".git").is_file() {
                "worktree"
            } else {
                classify_dir_heuristic(&path)
            }
        } else {
            classify_dir_heuristic(&path)
        };

        result.push(ClassifiedDir {
            name,
            path: path_str,
            category: category.to_string(),
        });
    }

    Ok(result)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Given a file path, find the immediate child of /var/home/luke/dev that contains it.
/// E.g. /var/home/luke/dev/naia-os/shell/src/App.tsx → /var/home/luke/dev/naia-os
fn find_session_dir(file_path: &Path) -> Option<PathBuf> {
    let root = PathBuf::from("/var/home/luke/dev");
    let mut current = file_path.parent()?;
    loop {
        match current.parent() {
            Some(p) if p == root => return Some(current.to_path_buf()),
            Some(p) => current = p,
            None => return None,
        }
    }
}

/// Runs `git worktree list --porcelain` from the workspace root to get all worktree paths.
fn get_all_worktree_paths(root: &Path) -> Vec<String> {
    // Try each git-repo child dir
    let mut paths = Vec::new();
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join(".git").is_dir() {
                if let Ok(output) = std::process::Command::new("git")
                    .args(["worktree", "list", "--porcelain"])
                    .current_dir(&p)
                    .output()
                {
                    if output.status.success() {
                        let text = String::from_utf8_lossy(&output.stdout);
                        for line in text.lines() {
                            if let Some(wt_path) = line.strip_prefix("worktree ") {
                                paths.push(wt_path.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    paths.sort();
    paths.dedup();
    paths
}
