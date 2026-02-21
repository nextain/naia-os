import { invoke } from "@tauri-apps/api/core";
import { Logger } from "./logger";

/**
 * Best-effort sync of Shell provider settings to OpenClaw gateway config.
 * Errors are logged but never block the UI.
 */
export async function syncToOpenClaw(
	provider: string,
	model: string,
	apiKey?: string,
): Promise<void> {
	try {
		await invoke("sync_openclaw_config", {
			params: { provider, model, api_key: apiKey || null },
		});
	} catch (err) {
		Logger.warn("openclaw-sync", "Failed to sync OpenClaw config", {
			error: String(err),
		});
	}
}
