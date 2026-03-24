import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logger } from "../../lib/logger";
import { WORKSPACE_ROOT } from "./constants";

export interface DirEntry {
	name: string;
	path: string;
	is_dir: boolean;
	children?: DirEntry[] | null;
	/** Classification category (Phase 4) */
	category?: string;
}

interface FileTreeProps {
	/** Called when a file is selected */
	onFileSelect: (path: string) => void;
	/** Currently open file path */
	openFilePath?: string;
	/** Session dirs that have active status (for highlighting) */
	activeDirs?: string[];
	/** Classified dirs for section display (Phase 4) */
	classifiedDirs?: Array<{ name: string; path: string; category: string }>;
	/** Actual workspace root (runtime override or compile-time fallback). */
	workspaceRoot?: string;
}

interface TreeNodeProps {
	entry: DirEntry;
	depth: number;
	onFileSelect: (path: string) => void;
	openFilePath?: string;
	activeDirs?: string[];
}

/** Strip trailing slash for path comparison */
function normPath(p: string): string {
	return p.replace(/\/$/, "");
}

function TreeNode({ entry, depth, onFileSelect, openFilePath, activeDirs }: TreeNodeProps) {
	const [expanded, setExpanded] = useState(false);
	const [children, setChildren] = useState<DirEntry[] | null>(null);
	const [loading, setLoading] = useState(false);
	const nodeRef = useRef<HTMLButtonElement>(null);
	/** Tracks which openFilePath we last auto-revealed for — prevents re-expanding after manual fold */
	const lastRevealedRef = useRef<string | null>(null);
	const isOpen = openFilePath ? normPath(openFilePath) === normPath(entry.path) : false;
	const isActive = activeDirs?.some((d) => normPath(d) === normPath(entry.path)) ?? false;

	// Auto-reveal: if this directory is an ancestor of the open file, expand it (once per file change)
	const shouldReveal =
		entry.is_dir &&
		openFilePath &&
		normPath(openFilePath).startsWith(normPath(entry.path) + "/") &&
		lastRevealedRef.current !== openFilePath;

	useEffect(() => {
		if (!shouldReveal || !openFilePath) return;
		lastRevealedRef.current = openFilePath;
		setExpanded(true);
		if (children === null && !loading) {
			setLoading(true);
			invoke<DirEntry[]>("workspace_list_dirs", { parent: entry.path })
				.then((result) => setChildren(result))
				.catch((e) => {
					Logger.warn("FileTree", "Failed to list dir (reveal)", {
						path: entry.path,
						error: String(e),
					});
					setChildren([]);
				})
				.finally(() => setLoading(false));
		}
	}, [shouldReveal, openFilePath, entry.path, children, loading]);

	// Auto-scroll to the open file node
	useEffect(() => {
		if (isOpen && nodeRef.current) {
			nodeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, [isOpen]);

	const toggle = useCallback(async () => {
		if (!entry.is_dir) {
			onFileSelect(entry.path);
			return;
		}
		if (expanded) {
			setExpanded(false);
			return;
		}
		setExpanded(true);
		if (children === null && !loading) {
			setLoading(true);
			try {
				const result = await invoke<DirEntry[]>("workspace_list_dirs", {
					parent: entry.path,
				});
				setChildren(result);
			} catch (e) {
				Logger.warn("FileTree", "Failed to list dir", { path: entry.path, error: String(e) });
				setChildren([]);
			} finally {
				setLoading(false);
			}
		}
	}, [entry, expanded, children, loading, onFileSelect]);

	const indent = depth * 16;
	const icon = entry.is_dir ? (expanded ? "▼" : "▶") : getFileIcon(entry.name);

	return (
		<div>
			<button
				ref={nodeRef}
				type="button"
				className={[
					"workspace-tree__node",
					isOpen ? "workspace-tree__node--open" : "",
					isActive ? "workspace-tree__node--active" : "",
					entry.is_dir ? "workspace-tree__node--dir" : "workspace-tree__node--file",
				]
					.filter(Boolean)
					.join(" ")}
				style={{ paddingLeft: `${indent + 8}px` }}
				onClick={toggle}
				title={entry.path}
			>
				<span className="workspace-tree__icon">{icon}</span>
				<span className="workspace-tree__name">{entry.name}</span>
				{isActive && <span className="workspace-tree__active-dot" title="Active session" />}
			</button>
			{entry.is_dir && expanded && (
				<div className="workspace-tree__children">
					{loading && (
						<div
							className="workspace-tree__loading"
							style={{ paddingLeft: `${indent + 24}px` }}
						>
							…
						</div>
					)}
					{children?.map((child) => (
						<TreeNode
							key={child.path}
							entry={child}
							depth={depth + 1}
							onFileSelect={onFileSelect}
							openFilePath={openFilePath}
							activeDirs={activeDirs}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function getFileIcon(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const icons: Record<string, string> = {
		ts: "📄",
		tsx: "⚛️",
		js: "📄",
		jsx: "⚛️",
		rs: "🦀",
		md: "📝",
		json: "{}",
		yaml: "📋",
		yml: "📋",
		toml: "📋",
		py: "🐍",
		sh: "💻",
		css: "🎨",
		html: "🌐",
		svg: "🖼️",
		png: "🖼️",
		jpg: "🖼️",
		gif: "🖼️",
		env: "🔒",
		lock: "🔒",
	};
	return icons[ext] ?? "📄";
}

export function FileTree({ onFileSelect, openFilePath, activeDirs, classifiedDirs, workspaceRoot = WORKSPACE_ROOT }: FileTreeProps) {
	const [entries, setEntries] = useState<DirEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Monotonically increasing ID — prevents stale invoke responses from
	// overwriting a fresher result when multiple loadEntries calls are in-flight.
	const fetchIdRef = useRef(0);

	const loadEntries = useCallback(async () => {
		const id = ++fetchIdRef.current;
		try {
			const result = await invoke<DirEntry[]>("workspace_list_dirs", {
				parent: workspaceRoot,
			});
			if (id !== fetchIdRef.current) return; // stale response — discard
			setEntries(result);
			Logger.info("FileTree", "Loaded workspace root", { count: result.length });
		} catch (e) {
			if (id !== fetchIdRef.current) return;
			Logger.warn("FileTree", "Failed to load workspace root", { error: String(e) });
		} finally {
			if (id === fetchIdRef.current) setLoading(false);
		}
	}, [workspaceRoot]);

	const debouncedLoadEntries = useCallback(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => void loadEntries(), 300);
	}, [loadEntries]);

	useEffect(() => {
		void loadEntries();

		// Refresh root entries on file-change events — debounced to coalesce
		// rapid bursts (e.g. git checkout rewriting many files at once).
		const unlistenPromise = listen<{
			session: string;
			file: string;
			timestamp: number;
		}>("workspace:file-changed", () => {
			debouncedLoadEntries();
		});

		return () => {
			unlistenPromise.then((fn) => fn()).catch(() => {});
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [loadEntries, debouncedLoadEntries]);

	if (loading) {
		return <div className="workspace-tree workspace-tree--loading">불러오는 중…</div>;
	}

	// Phase 4: if classified dirs provided, show in sections
	if (classifiedDirs && classifiedDirs.length > 0) {
		const sections: Record<string, typeof classifiedDirs> = {
			project: [],
			worktree: [],
			reference: [],
			docs: [],
			other: [],
		};
		for (const d of classifiedDirs) {
			const cat = d.category in sections ? d.category : "other";
			sections[cat].push(d);
		}

		const sectionLabels: Record<string, string> = {
			project: "🏗 프로젝트",
			worktree: "🌿 워크트리",
			reference: "📚 참조",
			docs: "📝 문서",
			other: "📁 기타",
		};

		// Guard: if no classified dir matches any loaded entry (path mismatch or
		// entries not yet loaded), show a fallback instead of a blank panel.
		const hasAnyMatch = Object.values(sections).some((dirs) =>
			dirs.some((d) => entries.some((e) => normPath(d.path) === normPath(e.path))),
		);

		if (!hasAnyMatch) {
			return (
				<div className="workspace-tree workspace-tree--empty">
					<div className="workspace-tree__empty-hint">분류된 디렉토리를 찾을 수 없습니다</div>
				</div>
			);
		}

		return (
			<div className="workspace-tree">
				{Object.entries(sections).map(([cat, dirs]) => {
					if (dirs.length === 0) return null;
					const classifiedEntries = entries.filter((e) =>
						dirs.some((d) => normPath(d.path) === normPath(e.path)),
					);
					if (classifiedEntries.length === 0) return null;
					return (
						<div key={cat} className="workspace-tree__section">
							<div className="workspace-tree__section-label">{sectionLabels[cat]}</div>
							{classifiedEntries.map((entry) => (
								<TreeNode
									key={entry.path}
									entry={entry}
									depth={0}
									onFileSelect={onFileSelect}
									openFilePath={openFilePath}
									activeDirs={activeDirs}
								/>
							))}
						</div>
					);
				})}
			</div>
		);
	}

	return (
		<div className="workspace-tree">
			{entries.map((entry) => (
				<TreeNode
					key={entry.path}
					entry={entry}
					depth={0}
					onFileSelect={onFileSelect}
					openFilePath={openFilePath}
					activeDirs={activeDirs}
				/>
			))}
		</div>
	);
}
