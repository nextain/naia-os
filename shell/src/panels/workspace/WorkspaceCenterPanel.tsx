import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadConfig, saveConfig } from "../../lib/config";
import { Logger } from "../../lib/logger";
import type { PanelCenterProps } from "../../lib/panel-registry";
import { ACTIVE_THRESHOLD_SECONDS } from "./constants";
import { Editor } from "./Editor";
import { FileTree } from "./FileTree";
import { SessionDashboard } from "./SessionDashboard";
import type { SessionInfo } from "./SessionCard";

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
	const [classifiedDirs, setClassifiedDirs] = useState<ClassifiedDir[] | null>(null);
	const [classifyPending, setClassifyPending] = useState(false);
	const [idleToast, setIdleToast] = useState<string | null>(null);
	const idleToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const idleNotifiedRef = useRef<Set<string>>(new Set());

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
				Logger.info("WorkspaceCenterPanel", "Classification recommendation pushed", { count: dirs.length });
			})
			.catch((e) => {
				Logger.warn("WorkspaceCenterPanel", "Classification failed", { error: String(e) });
			})
			.finally(() => {
				setClassifyPending(false);
			});
	}, [classifyPending, naia]);

	// ── Sessions update ───────────────────────────────────────────────────
	const handleSessionsUpdate = useCallback((updated: SessionInfo[]) => {
		sessionsRef.current = updated;
		setSessions(updated);

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
	}, [naia]);

	// ── Idle session notification ─────────────────────────────────────────
	useEffect(() => {
		const id = setInterval(() => {
			for (const session of sessionsRef.current) {
				if (session.status === "idle" && session.last_change) {
					const idleSec = Math.floor(Date.now() / 1000) - session.last_change;
					if (idleSec >= ACTIVE_THRESHOLD_SECONDS && !idleNotifiedRef.current.has(session.path)) {
						idleNotifiedRef.current.add(session.path);
						const alertMsg = `${session.dir} 세션이 ${Math.floor(idleSec / 60)}분째 입력을 기다리고 있어요`;
						// Visible toast in panel
						if (idleToastTimerRef.current) clearTimeout(idleToastTimerRef.current);
						setIdleToast(alertMsg);
						idleToastTimerRef.current = setTimeout(() => setIdleToast(null), 6000);
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
						Logger.info("WorkspaceCenterPanel", "Idle session alert", { dir: session.dir, idleSec });
					}
				} else if (session.status === "active") {
					// Reset notification if session becomes active again
					idleNotifiedRef.current.delete(session.path);
				}
			}
		}, 10000);
		return () => {
			clearInterval(id);
		};
	}, [naia]);

	// ── Session card click → open recent file ─────────────────────────────
	const handleSessionClick = useCallback(async (session: SessionInfo) => {
		Logger.info("WorkspaceCenterPanel", "Session card clicked", { dir: session.dir });

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

	// ── Naia tool: skill_workspace_get_sessions ───────────────────────────
	useEffect(() => {
		const unsub = naia.onToolCall("skill_workspace_get_sessions", () => {
			return JSON.stringify(sessionsRef.current);
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
		const unsub = naia.onToolCall("skill_workspace_classify_dirs", async (args) => {
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
		});
		return unsub;
	}, [naia]);

	// ── Active session dirs (for FileTree highlighting) ───────────────────
	const activeDirs = sessions
		.filter((s) => {
			if (s.status !== "active") return false;
			if (!s.last_change) return false;
			return Math.floor(Date.now() / 1000) - s.last_change < ACTIVE_THRESHOLD_SECONDS;
		})
		.map((s) => s.path);

	// ── Read-only: reference repos (ref-*) ────────────────────────────────
	const editorReadOnly = openFilePath
		? openFilePath.split("/").some((part) => part.startsWith("ref-"))
		: false;

	return (
		<div className="workspace-panel">
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
			<div className="workspace-panel__tree">
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

			{/* Right: SessionDashboard (top) + Editor (bottom) */}
			<div className="workspace-panel__right">
				<div className="workspace-panel__dashboard">
					<SessionDashboard
						onSessionClick={handleSessionClick}
						onSessionsUpdate={handleSessionsUpdate}
					/>
				</div>
				<div className="workspace-panel__editor">
					<Editor
						filePath={openFilePath}
						badge={editorBadge}
						readOnly={editorReadOnly}
					/>
				</div>
			</div>
		</div>
	);
}
