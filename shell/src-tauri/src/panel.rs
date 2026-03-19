use serde::{Deserialize, Serialize};

/// Panel manifest stored in ~/.naia/panels/{id}/panel.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PanelManifest {
	pub id: String,
	pub name: String,
	pub description: Option<String>,
	pub icon: Option<String>,
	/// Path to SVG icon file, relative to panel directory (e.g. "icon.svg")
	#[serde(rename = "iconUrl", skip_serializing_if = "Option::is_none")]
	pub icon_url: Option<String>,
	/// Inline SVG content — populated at load time from iconUrl, not stored in panel.json
	#[serde(rename = "iconSvg", skip_deserializing, skip_serializing_if = "Option::is_none")]
	pub icon_svg: Option<String>,
	pub names: Option<std::collections::HashMap<String, String>>,
	pub version: Option<String>,
	/// Absolute path to index.html if present — used for iframe rendering
	#[serde(rename = "htmlEntry", skip_deserializing, skip_serializing_if = "Option::is_none")]
	pub html_entry: Option<String>,
}

/// List installed panels by scanning ~/.naia/panels/
#[tauri::command]
pub fn panel_list_installed() -> Vec<PanelManifest> {
	let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
	let panels_dir = std::path::PathBuf::from(&home).join(".naia/panels");

	if !panels_dir.is_dir() {
		return Vec::new();
	}

	let mut panels: Vec<PanelManifest> = Vec::new();

	let entries = match std::fs::read_dir(&panels_dir) {
		Ok(e) => e,
		Err(_) => return Vec::new(),
	};

	for entry in entries.flatten() {
		let manifest_path = entry.path().join("panel.json");
		if !manifest_path.exists() {
			continue;
		}

		let data = match std::fs::read_to_string(&manifest_path) {
			Ok(d) => d,
			Err(_) => continue,
		};

		let mut manifest: PanelManifest = match serde_json::from_str(&data) {
			Ok(m) => m,
			Err(_) => continue,
		};

		// Load inline SVG if iconUrl is specified
		if let Some(ref icon_url) = manifest.icon_url.clone() {
			let svg_path = entry.path().join(icon_url);
			if let Ok(svg) = std::fs::read_to_string(&svg_path) {
				manifest.icon_svg = Some(svg);
			}
		}

		// Detect index.html for iframe rendering
		let html_path = entry.path().join("index.html");
		if html_path.exists() {
			manifest.html_entry = html_path.to_string_lossy().into_owned().into();
		}

		panels.push(manifest);
	}

	panels
}

/// Remove an installed panel directory from ~/.naia/panels/{panelId}/
#[tauri::command]
pub fn panel_remove_installed(panel_id: String) -> Result<(), String> {
	// Validate: no path traversal
	if panel_id.contains('/') || panel_id.contains('\\') || panel_id.contains("..") {
		return Err(format!("Invalid panel id: {}", panel_id));
	}

	let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
	let panel_dir = std::path::PathBuf::from(&home)
		.join(".naia/panels")
		.join(&panel_id);

	if !panel_dir.exists() {
		return Ok(()); // already gone
	}

	std::fs::remove_dir_all(&panel_dir)
		.map_err(|e| format!("Failed to remove panel {}: {}", panel_id, e))
}
