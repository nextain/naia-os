import { useCallback, useEffect, useState } from "react";
import { directToolCall } from "../lib/chat-service";
import { loadConfig, resolveGatewayUrl } from "../lib/config";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import type { ChannelInfo } from "../lib/types";

interface ChannelsTabProps {
	onAskAI?: (message: string) => void;
}

export function ChannelsTab({ onAskAI }: ChannelsTabProps) {
	const [channels, setChannels] = useState<ChannelInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchChannels = useCallback(async () => {
		setLoading(true);
		setError(null);

		const config = loadConfig();
		const gatewayUrl = resolveGatewayUrl(config);
		if (!gatewayUrl || !config?.enableTools) {
			setLoading(false);
			setError(t("channels.gatewayRequired"));
			return;
		}

		try {
			const result = await directToolCall({
				toolName: "skill_channels",
				args: { action: "status" },
				requestId: `ch-status-${Date.now()}`,
				gatewayUrl,
				gatewayToken: config.gatewayToken,
			});

			if (result.success && result.output) {
				const parsed = JSON.parse(result.output) as ChannelInfo[];
				setChannels(parsed);
			} else {
				setChannels([]);
			}
		} catch (err) {
			Logger.warn("ChannelsTab", "Failed to fetch channels", {
				error: String(err),
			});
			setError(t("channels.error"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchChannels();
	}, [fetchChannels]);

	const handleLogout = useCallback(
		async (channelId: string) => {
			if (!confirm(t("channels.logoutConfirm"))) return;

			const config = loadConfig();
			const gatewayUrl = resolveGatewayUrl(config);
			try {
				await directToolCall({
					toolName: "skill_channels",
					args: { action: "logout", channel: channelId },
					requestId: `ch-logout-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				});
				fetchChannels();
			} catch (err) {
				Logger.warn("ChannelsTab", "Logout failed", {
					error: String(err),
				});
			}
		},
		[fetchChannels],
	);

	const handleLogin = useCallback(
		(channelId: string) => {
			if (onAskAI) {
				onAskAI(
					`채널 ${channelId} 로그인을 시작해줘. skill_channels의 login_start 액션을 사용해.`,
				);
			}
		},
		[onAskAI],
	);

	if (loading) {
		return (
			<div className="channels-tab" data-testid="channels-tab">
				<div className="channels-loading">{t("channels.loading")}</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="channels-tab" data-testid="channels-tab">
				<div className="channels-error">
					<span>{error}</span>
					<button type="button" onClick={fetchChannels}>
						{t("channels.refresh")}
					</button>
				</div>
			</div>
		);
	}

	if (channels.length === 0) {
		return (
			<div className="channels-tab" data-testid="channels-tab">
				<div className="channels-empty">
					<span>{t("channels.empty")}</span>
					<button type="button" onClick={fetchChannels}>
						{t("channels.refresh")}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="channels-tab" data-testid="channels-tab">
			<div className="channels-header">
				<h3>{t("channels.title")}</h3>
				<button type="button" className="channels-refresh-btn" onClick={fetchChannels}>
					{t("channels.refresh")}
				</button>
			</div>
			<div className="channels-list">
				{channels.map((ch) => (
					<div key={ch.id} className="channel-card" data-testid="channel-card">
						<div className="channel-card-header">
							<span className="channel-name">{ch.label}</span>
							<span className="channel-id">{ch.id}</span>
						</div>
						{ch.accounts.length === 0 ? (
							<div className="channel-no-accounts">
								{t("channels.noAccounts")}
							</div>
						) : (
							ch.accounts.map((acc) => (
								<div
									key={acc.accountId}
									className="channel-account"
									data-testid="channel-account"
								>
									<div className="channel-account-info">
										<span className="channel-account-name">
											{acc.name || acc.accountId}
										</span>
										<span
											className={`channel-status-badge ${acc.connected ? "connected" : "disconnected"}`}
											data-testid="channel-status"
										>
											{acc.connected
												? t("channels.connected")
												: t("channels.disconnected")}
										</span>
										{acc.lastError && (
											<span className="channel-error-text">
												{acc.lastError}
											</span>
										)}
									</div>
									<div className="channel-account-actions">
										{acc.connected ? (
											<button
												type="button"
												className="channel-action-btn logout"
												onClick={() =>
													handleLogout(ch.id)
												}
											>
												{t("channels.logout")}
											</button>
										) : (
											<button
												type="button"
												className="channel-action-btn login"
												onClick={() =>
													handleLogin(ch.id)
												}
											>
												{t("channels.login")}
											</button>
										)}
									</div>
								</div>
							))
						)}
					</div>
				))}
			</div>
		</div>
	);
}
