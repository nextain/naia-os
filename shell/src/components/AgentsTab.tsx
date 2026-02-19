import { useCallback, useEffect, useState } from "react";
import { directToolCall } from "../lib/chat-service";
import { loadConfig } from "../lib/config";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";

interface AgentItem {
	id: string;
	name: string;
	description?: string;
	model?: string;
}

interface SessionItem {
	key: string;
	label?: string;
	messageCount?: number;
	status?: string;
}

export function AgentsTab() {
	const [agents, setAgents] = useState<AgentItem[]>([]);
	const [sessions, setSessions] = useState<SessionItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);

		const config = loadConfig();
		if (!config?.gatewayUrl || !config?.enableTools) {
			setLoading(false);
			setError(t("agents.gatewayRequired"));
			return;
		}

		try {
			const [agentsRes, sessionsRes] = await Promise.all([
				directToolCall({
					toolName: "skill_agents",
					args: { action: "list" },
					requestId: `ag-list-${Date.now()}`,
					gatewayUrl: config.gatewayUrl,
					gatewayToken: config.gatewayToken,
				}),
				directToolCall({
					toolName: "skill_sessions",
					args: { action: "list" },
					requestId: `ss-list-${Date.now()}`,
					gatewayUrl: config.gatewayUrl,
					gatewayToken: config.gatewayToken,
				}),
			]);

			if (agentsRes.success && agentsRes.output) {
				const parsed = JSON.parse(agentsRes.output);
				setAgents(parsed.agents || []);
			}
			if (sessionsRes.success && sessionsRes.output) {
				const parsed = JSON.parse(sessionsRes.output);
				setSessions(parsed.sessions || []);
			}
		} catch (err) {
			Logger.warn("AgentsTab", "Failed to fetch data", {
				error: String(err),
			});
			setError(t("agents.error"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleDeleteSession = useCallback(
		async (key: string) => {
			if (!confirm(t("agents.deleteSessionConfirm"))) return;
			const config = loadConfig();
			try {
				await directToolCall({
					toolName: "skill_sessions",
					args: { action: "delete", key },
					requestId: `ss-del-${Date.now()}`,
					gatewayUrl: config?.gatewayUrl,
					gatewayToken: config?.gatewayToken,
				});
				fetchData();
			} catch (err) {
				Logger.warn("AgentsTab", "Delete session failed", {
					error: String(err),
				});
			}
		},
		[fetchData],
	);

	const handleCompactSession = useCallback(
		async (key: string) => {
			const config = loadConfig();
			try {
				await directToolCall({
					toolName: "skill_sessions",
					args: { action: "compact", key },
					requestId: `ss-compact-${Date.now()}`,
					gatewayUrl: config?.gatewayUrl,
					gatewayToken: config?.gatewayToken,
				});
				fetchData();
			} catch (err) {
				Logger.warn("AgentsTab", "Compact session failed", {
					error: String(err),
				});
			}
		},
		[fetchData],
	);

	if (loading) {
		return (
			<div className="agents-tab" data-testid="agents-tab">
				<div className="agents-loading">{t("agents.loading")}</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="agents-tab" data-testid="agents-tab">
				<div className="agents-error">
					<span>{error}</span>
					<button type="button" onClick={fetchData}>
						{t("agents.refresh")}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="agents-tab" data-testid="agents-tab">
			{/* Agents section */}
			<div className="agents-section">
				<div className="agents-section-header">
					<h3>{t("agents.agentsTitle")}</h3>
					<button
						type="button"
						className="agents-refresh-btn"
						onClick={fetchData}
					>
						{t("agents.refresh")}
					</button>
				</div>
				{agents.length === 0 ? (
					<div className="agents-empty">{t("agents.noAgents")}</div>
				) : (
					<div className="agents-list">
						{agents.map((agent) => (
							<div
								key={agent.id}
								className="agent-card"
								data-testid="agent-card"
							>
								<div className="agent-card-name">{agent.name}</div>
								{agent.description && (
									<div className="agent-card-desc">
										{agent.description}
									</div>
								)}
								{agent.model && (
									<div className="agent-card-model">{agent.model}</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Sessions section */}
			<div className="agents-section">
				<h3>{t("agents.sessionsTitle")}</h3>
				{sessions.length === 0 ? (
					<div className="agents-empty">{t("agents.noSessions")}</div>
				) : (
					<div className="sessions-list">
						{sessions.map((session) => (
							<div
								key={session.key}
								className="session-card"
								data-testid="session-card"
							>
								<div className="session-card-info">
									<span className="session-card-label">
										{session.label || session.key}
									</span>
									<span className="session-card-meta">
										{session.messageCount ?? 0} msgs
										{session.status && ` · ${session.status}`}
									</span>
								</div>
								<div className="session-card-actions">
									<button
										type="button"
										className="session-action-btn compact"
										onClick={() =>
											handleCompactSession(session.key)
										}
									>
										{t("agents.compact")}
									</button>
									<button
										type="button"
										className="session-action-btn delete"
										onClick={() =>
											handleDeleteSession(session.key)
										}
									>
										{t("agents.deleteSession")}
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
