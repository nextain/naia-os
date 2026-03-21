import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { Logger } from "../../lib/logger";
import { SessionCard, type SessionInfo } from "./SessionCard";

interface SessionDashboardProps {
	onSessionClick: (session: SessionInfo) => void;
	/** Callback to expose current session list to parent */
	onSessionsUpdate?: (sessions: SessionInfo[]) => void;
}

export function SessionDashboard({
	onSessionClick,
	onSessionsUpdate,
}: SessionDashboardProps) {
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const onSessionsUpdateRef = useRef(onSessionsUpdate);
	onSessionsUpdateRef.current = onSessionsUpdate;

	const loadSessions = async () => {
		try {
			const result = await invoke<SessionInfo[]>("workspace_get_sessions");
			setSessions(result);
			onSessionsUpdateRef.current?.(result);
		} catch (e) {
			Logger.warn("SessionDashboard", "Failed to load sessions", {
				error: String(e),
			});
			onSessionsUpdateRef.current?.([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadSessions();

		// Listen for file change events — refresh session list
		const unlistenPromise = listen<{
			session: string;
			file: string;
			timestamp: number;
		}>("workspace:file-changed", () => {
			void loadSessions();
		});

		// Periodic refresh every 15s for status re-computation
		const intervalId = setInterval(() => void loadSessions(), 15000);

		return () => {
			unlistenPromise.then((fn) => fn());
			clearInterval(intervalId);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (loading) {
		return (
			<div className="workspace-dashboard workspace-dashboard--loading">
				세션 스캔 중…
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="workspace-dashboard workspace-dashboard--empty">
				<div className="workspace-dashboard__empty-hint">
					Git 레포가 없습니다.{" "}
					<span className="workspace-dashboard__empty-path">
						/var/home/luke/dev
					</span>
					에 git 레포가 있어야 합니다.
				</div>
			</div>
		);
	}

	return (
		<div className="workspace-dashboard">
			<div className="workspace-dashboard__header">
				<span className="workspace-dashboard__title">
					세션 ({sessions.length})
				</span>
				<button
					type="button"
					className="workspace-dashboard__refresh"
					onClick={() => void loadSessions()}
					title="새로고침"
				>
					↻
				</button>
			</div>
			<div className="workspace-dashboard__grid">
				{sessions.map((session) => (
					<SessionCard
						key={session.path}
						session={session}
						onClick={onSessionClick}
					/>
				))}
			</div>
		</div>
	);
}
