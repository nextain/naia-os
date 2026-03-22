import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat";
import { loadConfig, saveConfig } from "../../lib/config";
import { Logger } from "../../lib/logger";
import { panelRegistry } from "../../lib/panel-registry";
import type { PanelCenterProps } from "../../lib/panel-registry";
import { usePanelStore } from "../../stores/panel";
import { Editor } from "./Editor";
import { FileTree } from "./FileTree";
import type { SessionInfo } from "./SessionCard";
import { SessionDashboard } from "./SessionDashboard";
import { ACTIVE_THRESHOLD_SECONDS } from "./constants";

// ─── Panel API ───────────────────────────────────────────────────────────────

/**
 * Programmatic API exposed by the Workspace panel.
 * Access via `panelRegistry.getApi<WorkspacePanelApi>("workspace")`.
 */
export interface WorkspacePanelApi {
	/** Open a file in the Editor. */
	openFile: (path: string) => void;
	/**
	 * Highlight (visually focus) a session card by its `dir` identifier.
	 * Full scroll-into-view is implemented in #117.
	 * Caller should invoke `activatePanel()` first if the Workspace panel
	 * is not currently visible — focusSession only highlights, it does not
	 * switch panels.
	 */
	focusSession: (dir: string) => void;
	/** Return the current live session list. */
	getActiveSessions: () => SessionInfo[];
	/** Switch the center panel to Workspace. */
	activatePanel: () => void;
}

// ─── Re-export for FileTree ───────────────────────────────────────────────────

// Re-export for FileTree to use
export interface ClassifiedDir {
	name: string;
	path: string;
	category: string;
}

const CLASSIFIED_DIRS_KEY = "workspace-classified-dirs";

function loadClassifiedDirs(): ClassifiedDir[] | null {
	try {
		const raw = localStorage.getItem(CLASSIFIED_DIRS_KEY);
		if (raw) return JSON.parse(raw) as ClassifiedDir[];
	} catch {}
	return null;
}

function saveClassifiedDirs(dirs: ClassifiedDir[]): void {
	try {
		localStorage.setItem(CLASSIFIED_DIRS_KEY, JSON.stringify(dirs));
	} catch {}
}

export function WorkspaceCenterPanel({ naia }: PanelCenterProps) {
	const [openFilePath, setOpenFilePath] = useState("");
	const [editorBadge, setEditorBadge] = useState("");
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const sessionsRef = useRef<SessionInfo[]>([]);
	const [classifiedDirs, setClassifiedDirs] = useState<ClassifiedDir[] | null>(
		null,
	);
	const [classifyPending, setClassifyPending] = useState(false);
	const [idleToast, setIdleToast] = useState<string | null>(null);
	const idleToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const idleNotifiedRef = useRef<Set<string>>(new Set());
	/** Session dir highlighted by focusSession() API call — cleared after 3s */
	const [highlightedSessionDir, setHighlightedSessionDir] = useState<
		string | null
	>(null);
	const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** True until the first session fetch resolves (hides blank flash on first render) */
	const initializedRef = useRef(false);
	const [initialized, setInitialized] = useState(false);

	// ── Drag-resize panel widths ───────────────────────────────────────────
	const [treeWidth, setTreeWidth] = useState(220);
	const treeWidthRef = useRef(220);
	treeWidthRef.current = treeWidth;
	const [sessionsWidth, setSessionsWidth] = useState(200);
	const sessionsWidthRef = useRef(200);
	sessionsWidthRef.current = sessionsWidth;

	const onTreeResizeStart = useCallback((e: React.PointerEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startW = treeWidthRef.current;
		document.body.classList.add("resizing-col");
		const onMove = (ev: PointerEvent) => {
			setTreeWidth(Math.max(120, Math.min(400, startW + ev.clientX - startX)));
		};
		const onUp = () => {
			document.body.classList.remove("resizing-col");
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}, []);

	const onSessionsResizeStart = useCallback((e: React.PointerEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startW = sessionsWidthRef.current;
		document.body.classList.add("resizing-col");
		const onMove = (ev: PointerEvent) => {
			// Handle is on the left edge of sessions → dragging left increases width
			setSessionsWidth(
				Math.max(120, Math.min(400, startW - (ev.clientX - startX))),
			);
		};
		const onUp = () => {
			document.body.classList.remove("resizing-col");
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}, []);

	// ── Load persisted classification ─────────────────────────────────────
	useEffect(() => {
		const saved = loadClassifiedDirs();
		if (saved) {
			setClassifiedDirs(saved);
		} else {
			// First launch: trigger classification recommendation via Naia
			setClassifyPending(true);
		}
	}, []);

	// ── Phase 4: First-run classification recommendation ──────────────────
	useEffect(() => {
		if (!classifyPending) return;
		// Run classification and push recommendation via Naia context
		invoke<ClassifiedDir[]>("workspace_classify_dirs")
			.then((dirs) => {
				naia.pushContext({
					type: "workspace",
					data: {
						classificationRecommendation: dirs,
						message:
							"workspace_classify_dirs 결과입니다. skill_workspace_classify_dirs 도구를 통해 사용자에게 분류 추천을 보여주세요.",
					},
				});
				Logger.info(
					"WorkspaceCenterPanel",
					"Classification recommendation pushed",
					{ count: dirs.length },
				);
			})
			.catch((e) => {
				Logger.warn("WorkspaceCenterPanel", "Classification failed", {
					error: String(e),
				});
			})
			.finally(() => {
				setClassifyPending(false);
			});
	}, [classifyPending, naia]);

	// ── Sessions update ───────────────────────────────────────────────────
	const handleSessionsUpdate = useCallback(
		(updated: SessionInfo[]) => {
			sessionsRef.current = updated;
			setSessions(updated);
			if (!initializedRef.current) {
				initializedRef.current = true;
				setInitialized(true);
			}

			// Re-arm idle notification immediately when a session becomes active,
			// without waiting for the 10-second setInterval tick. This prevents
			// brief active periods (<10s) from being invisible to the notifier.
			for (const s of updated) {
				if (s.status === "active") {
					idleNotifiedRef.current.delete(s.path);
				}
			}

			// Update Naia context with session state
			naia.pushContext({
				type: "workspace",
				data: {
					sessions: updated.map((s) => ({
						dir: s.dir,
						status: s.status,
						branch: s.branch ?? null,
						issue: s.progress?.issue ?? null,
						phase: s.progress?.phase ?? null,
						recentFile: s.recent_file ?? null,
						idleSince: s.last_change
							? Math.floor(Date.now() / 1000) - s.last_change
							: null,
					})),
				},
			});
		},
		[naia],
	);

	// ── Idle session notification ─────────────────────────────────────────
	useEffect(() => {
		const id = setInterval(() => {
			for (const session of sessionsRef.current) {
				if (session.status === "idle" && session.last_change) {
					const idleSec = Math.floor(Date.now() / 1000) - session.last_change;
					if (
						idleSec >= ACTIVE_THRESHOLD_SECONDS &&
						!idleNotifiedRef.current.has(session.path)
					) {
						idleNotifiedRef.current.add(session.path);
						const idleMin = Math.max(1, Math.floor(idleSec / 60));
						const alertMsg = `${session.dir} 세션이 ${idleMin}분째 입력을 기다리고 있어요`;
						// Visible toast in panel
						if (idleToastTimerRef.current)
							clearTimeout(idleToastTimerRef.current);
						setIdleToast(alertMsg);
						idleToastTimerRef.current = setTimeout(() => {
							setIdleToast(null);
							idleToastTimerRef.current = null;
						}, 6000);
						// Also push to Naia context for AI awareness
						naia.pushContext({
							type: "workspace",
							data: {
								idleAlert: {
									dir: session.dir,
									idleSeconds: idleSec,
									message: alertMsg,
								},
							},
						});
						Logger.info("WorkspaceCenterPanel", "Idle session alert", {
							dir: session.dir,
							idleSec,
						});
					}
				}
				// Active re-arm is handled in handleSessionsUpdate on every session
				// poll — no need to duplicate here every 10 seconds.
			}
		}, 10000);
		return () => {
			clearInterval(id);
			if (idleToastTimerRef.current) {
				clearTimeout(idleToastTimerRef.current);
				idleToastTimerRef.current = null;
			}
		};
	}, [naia]);

	// ── Clear idle state on new conversation ──────────────────────────────
	const sessionId = useChatStore((s) => s.sessionId);
	useEffect(() => {
		if (sessionId !== null) return;
		// newConversation() sets sessionId to null — user is starting fresh,
		// so dismiss any lingering idle toast and re-arm all notifications.
		// On initial mount sessionId is also null, but idleNotifiedRef is empty
		// and idleToast is null, so this is a no-op and causes no harm.
		idleNotifiedRef.current.clear();
		setIdleToast(null);
		if (idleToastTimerRef.current) {
			clearTimeout(idleToastTimerRef.current);
			idleToastTimerRef.current = null;
		}
	}, [sessionId]);

	// ── Session card click → open recent file ─────────────────────────────
	const handleSessionClick = useCallback(async (session: SessionInfo) => {
		Logger.info("WorkspaceCenterPanel", "Session card clicked", {
			dir: session.dir,
		});

		// Badge from progress
		const badge =
			session.progress?.issue && session.progress?.phase
				? `${session.progress.issue} · ${session.progress.phase}`
				: "";
		setEditorBadge(badge);

		// Determine which file to open
		let fileToOpen = "";
		if (session.recent_file) {
			fileToOpen = `${session.path}/${session.recent_file}`;
		} else {
			// Fallback: AGENTS.md or README.md
			for (const fallback of ["AGENTS.md", "README.md"]) {
				const candidate = `${session.path}/${fallback}`;
				try {
					await invoke("workspace_read_file", { path: candidate });
					fileToOpen = candidate;
					break;
				} catch {
					// not found, try next
				}
			}
		}

		if (fileToOpen) {
			setOpenFilePath(fileToOpen);
		}
	}, []);

	// ── File select from tree ─────────────────────────────────────────────
	const handleFileSelect = useCallback((path: string) => {
		setOpenFilePath(path);
		// Clear badge when directly selecting a file
		setEditorBadge("");
	}, []);

	// ── Panel API (WorkspacePanelApi) ─────────────────────────────────────
	// Register a live API so other panels (e.g. Issue Desk) can call
	// openFile / focusSession without importing internal component modules.
	useEffect(() => {
		panelRegistry.updateApi("workspace", {
			openFile: (path: string) => {
				setOpenFilePath(path);
				setEditorBadge("");
			},
			focusSession: (dir: string) => {
				if (!sessionsRef.current.some((s) => s.dir === dir)) {
					Logger.warn("WorkspaceCenterPanel", "focusSession: dir not found", { dir });
					return;
				}
				// Cancel any in-flight highlight timer before starting a new one
				if (highlightTimerRef.current)
					clearTimeout(highlightTimerRef.current);
				setHighlightedSessionDir(dir);
				highlightTimerRef.current = setTimeout(() => {
					setHighlightedSessionDir(null);
					highlightTimerRef.current = null;
				}, 3000);
			},
			getActiveSessions: () => sessionsRef.current,
			activatePanel: () =>
				usePanelStore.getState().setActivePanel("workspace"),
		} satisfies WorkspacePanelApi);
		return () => {
			panelRegistry.updateApi("workspace", undefined);
			// Cancel pending highlight timer on unmount to avoid setState after unmount
			if (highlightTimerRef.current) {
				clearTimeout(highlightTimerRef.current);
				highlightTimerRef.current = null;
			}
		};
	}, []); // stable: setters and refs never change

	// ── Naia tool: skill_workspace_get_sessions ───────────────────────────
	useEffect(() => {
		const unsub = naia.onToolCall("skill_workspace_get_sessions", () => {
			const currentSessions = sessionsRef.current;
			const counts = { active: 0, idle: 0, stopped: 0, error: 0 };
			for (const s of currentSessions) {
				const key = s.status as keyof typeof counts;
				if (key in counts) counts[key]++;
			}
			// Build natural-language description for "내가 뭐 하고 있어?" queries
			const activeDetails = currentSessions
				.filter((s) => s.status === "active")
				.map((s) => {
					const issue = s.progress?.issue ? ` (${s.progress.issue})` : "";
					const branch = s.branch ? ` [${s.branch}]` : "";
					return `${s.dir}${branch}${issue}`;
				});
			const parts: string[] = [];
			if (counts.active > 0) parts.push(`active ${counts.active}개: ${activeDetails.join(", ")}`);
			if (counts.idle > 0) parts.push(`idle ${counts.idle}개`);
			if (counts.stopped > 0) parts.push(`stopped ${counts.stopped}개`);
			if (counts.error > 0) parts.push(`error ${counts.error}개`);
			const description = parts.length > 0 ? parts.join(", ") : "세션 없음";
			return JSON.stringify({
				sessions: currentSessions,
				summary: {
					total: counts.active + counts.idle + counts.stopped + counts.error,
					active: counts.active,
					idle: counts.idle,
					stopped: counts.stopped,
					error: counts.error,
					description,
				},
			});
		});
		return unsub;
	}, [naia]);

	// ── Naia tool: skill_workspace_open_file ─────────────────────────────
	useEffect(() => {
		const unsub = naia.onToolCall("skill_workspace_open_file", (args) => {
			const path = String(args.path ?? "");
			if (!path) return "Error: path is required";
			setOpenFilePath(path);
			setEditorBadge("");
			return `Opened: ${path}`;
		});
		return unsub;
	}, [naia]);

	// ── Naia tool: skill_workspace_classify_dirs ─────────────────────────
	useEffect(() => {
		const unsub = naia.onToolCall(
			"skill_workspace_classify_dirs",
			async (args) => {
				// If dirs provided in args, apply them (user confirmed)
				const confirmed = args.confirmed as ClassifiedDir[] | undefined;
				if (confirmed && Array.isArray(confirmed)) {
					setClassifiedDirs(confirmed);
					saveClassifiedDirs(confirmed);
					// Also persist to config
					const cfg = loadConfig();
					if (cfg) {
						saveConfig({ ...cfg });
					}
					return `Classification applied: ${confirmed.length} directories`;
				}
				// Otherwise run classification and return recommendation
				try {
					const dirs = await invoke<ClassifiedDir[]>("workspace_classify_dirs");
					return JSON.stringify(dirs);
				} catch (e) {
					return `Error: ${String(e)}`;
				}
			},
		);
		return unsub;
	}, [naia]);

	// ── Active session dirs (for FileTree highlighting) ───────────────────
	const activeDirs = sessions
		.filter((s) => {
			if (s.status !== "active") return false;
			if (!s.last_change) return false;
			return (
				Math.floor(Date.now() / 1000) - s.last_change < ACTIVE_THRESHOLD_SECONDS
			);
		})
		.map((s) => s.path);

	// ── Read-only: reference repos (ref-*) ────────────────────────────────
	const editorReadOnly = openFilePath
		? openFilePath.split("/").some((part) => part.startsWith("ref-"))
		: false;

	return (
		<div className="workspace-panel">
			{/* Initial loading overlay — hides blank flash before first session fetch */}
			{!initialized && (
				<div className="workspace-panel__loading">
					<span className="workspace-panel__loading-spinner" />
					<span>워크스페이스 로딩 중…</span>
				</div>
			)}
			{/* Idle session toast (F8) */}
			{idleToast && (
				<div
					className="workspace-panel__idle-toast"
					onClick={() => setIdleToast(null)}
					role="alert"
				>
					🟡 {idleToast}
				</div>
			)}

			{/* Left: FileTree */}
			<div
				className="workspace-panel__tree"
				style={{ width: `${treeWidth}px` }}
			>
				<div className="workspace-panel__tree-header">
					<span className="workspace-panel__tree-title">탐색기</span>
				</div>
				<div className="workspace-panel__tree-body">
					<FileTree
						onFileSelect={handleFileSelect}
						openFilePath={openFilePath}
						activeDirs={activeDirs}
						classifiedDirs={classifiedDirs ?? undefined}
					/>
				</div>
			</div>
			<div
				className="workspace-panel__resize-handle"
				onPointerDown={onTreeResizeStart}
			/>

			{/* Center: Editor */}
			<div className="workspace-panel__editor">
				<Editor
					filePath={openFilePath}
					badge={editorBadge}
					readOnly={editorReadOnly}
				/>
			</div>
			<div
				className="workspace-panel__resize-handle"
				onPointerDown={onSessionsResizeStart}
			/>

			{/* Right: Session sidebar (vertical card list) */}
			<div
				className="workspace-panel__sessions"
				style={{ width: `${sessionsWidth}px` }}
			>
				<SessionDashboard
					onSessionClick={handleSessionClick}
					onSessionsUpdate={handleSessionsUpdate}
					highlightedDir={highlightedSessionDir ?? undefined}
				/>
			</div>
		</div>
	);
}
