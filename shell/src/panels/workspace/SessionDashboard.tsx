import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logger } from "../../lib/logger";
import { WORKSPACE_ROOT } from "./constants";
import { SessionCard, type SessionInfo } from "./SessionCard";

interface SessionDashboardProps {
	onSessionClick: (session: SessionInfo) => void;
	/** Callback to expose current session list to parent */
	onSessionsUpdate?: (sessions: SessionInfo[]) => void;
	/** Dir identifier of the session to visually highlight (from Panel API focusSession) */
	highlightedDir?: string;
}

export function SessionDashboard({
	onSessionClick,
	onSessionsUpdate,
	highlightedDir,
}: SessionDashboardProps) {
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const onSessionsUpdateRef = useRef(onSessionsUpdate);
	onSessionsUpdateRef.current = onSessionsUpdate;
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Monotonically increasing ID — prevents stale invoke responses from overwriting
	// a fresher result when multiple loadSessions calls are in-flight simultaneously.
	const fetchIdRef = useRef(0);

	const loadSessions = useCallback(async () => {
		const id = ++fetchIdRef.current;
		try {
			const result = await invoke<SessionInfo[]>("workspace_get_sessions");
			if (id !== fetchIdRef.current) return; // stale response — discard
			setSessions(result);
			onSessionsUpdateRef.current?.(result);
		} catch (e) {
			if (id !== fetchIdRef.current) return;
			Logger.warn("SessionDashboard", "Failed to load sessions", {
				error: String(e),
			});
			onSessionsUpdateRef.current?.([]);
		} finally {
			if (id === fetchIdRef.current) setLoading(false);
		}
	}, []); // stable: depends only on stable refs and setState

	const debouncedLoadSessions = useCallback(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => void loadSessions(), 300);
	}, [loadSessions]);

	useEffect(() => {
		void loadSessions();

		// Listen for file change events — debounced to coalesce rapid bursts
		// (e.g. git checkout rewriting many files at once).
		const unlistenPromise = listen<{
			session: string;
			file: string;
			timestamp: number;
		}>("workspace:file-changed", () => {
			debouncedLoadSessions();
		});

		// Periodic refresh every 15s for status re-computation
		const intervalId = setInterval(() => void loadSessions(), 15000);

		return () => {
			unlistenPromise.then((fn) => fn()).catch(() => {});
			clearInterval(intervalId);
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [loadSessions, debouncedLoadSessions]);

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
						{WORKSPACE_ROOT}
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
						highlighted={session.dir === highlightedDir}
					/>
				))}
			</div>
		</div>
	);
}
