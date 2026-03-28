// Workspace configuration utilities

/** App configuration loaded from tauri-plugin-store */
interface AppConfig {
	workspaceRoot?: string;
	theme?: string;
	language?: string;
}

/** Get the workspace root, trimmed and normalized */
export function getWorkspaceRoot(config: AppConfig): string {
	const root = config.workspaceRoot.trim();
	return root.replace(/\\/g, "/");
}

/** Threshold in seconds for "active" session status. */
export const ACTIVE_THRESHOLD_SECONDS = 30;

/** Threshold in seconds for "stopped" session status. */
export const STOPPED_THRESHOLD_SECONDS = 1800;

/** Debounce delay for auto-save in milliseconds. */
export const AUTOSAVE_DEBOUNCE_MS = 800;
