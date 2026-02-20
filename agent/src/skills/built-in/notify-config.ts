import { readFile } from "node:fs/promises";

export type NotifyProvider = "slack" | "discord" | "google_chat";

const ENV_VAR_MAP: Record<NotifyProvider, string> = {
        slack: "SLACK_WEBHOOK_URL",
        discord: "DISCORD_WEBHOOK_URL",
        google_chat: "GOOGLE_CHAT_WEBHOOK_URL",
};
/**
 * Resolve webhook URL for a notification provider.
 * Priority: environment variable > ~/.cafelua/config.json > null
 */
export async function getNotifyWebhookUrl(
	provider: NotifyProvider,
): Promise<string | null> {
	// 1. Environment variable (highest priority)
	const envVar = ENV_VAR_MAP[provider];
	if (envVar) {
		const envValue = process.env[envVar];
		if (envValue?.trim()) {
			return envValue.trim();
		}
	}

	// 2. config.json fallback
	try {
		const home = process.env.HOME ?? "~";
		const raw = await readFile(`${home}/.cafelua/config.json`, "utf-8");
		const config = JSON.parse(raw) as {
			notifications?: Record<string, { webhookUrl?: string }>;
			discordWebhookUrl?: string;
			googleChatWebhookUrl?: string;
		};
		// Check new flat structure first
		if (provider === "discord" && config.discordWebhookUrl?.trim()) return config.discordWebhookUrl.trim();
		if (provider === "google_chat" && config.googleChatWebhookUrl?.trim()) return config.googleChatWebhookUrl.trim();
		
		// Fallback to old nested structure
		const url = config.notifications?.[provider]?.webhookUrl;
		if (url?.trim()) {
			return url.trim();
		}
	} catch {
		// File not found or invalid JSON — fall through
	}

	return null;
}
