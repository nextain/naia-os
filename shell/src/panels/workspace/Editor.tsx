import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Logger } from "../../lib/logger";
import { AUTOSAVE_DEBOUNCE_MS } from "./constants";

interface EditorProps {
	/** Absolute path of the file being edited. Empty = no file open. */
	filePath: string;
	/** Badge text shown above editor (e.g. "#79 · Build") */
	badge?: string;
	/** If true, editing is disabled (reference repos) */
	readOnly?: boolean;
}

function getLanguageExtension(filePath: string) {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
		return javascript({ typescript: ext === "ts" || ext === "tsx", jsx: ext === "tsx" || ext === "jsx" });
	}
	if (ext === "md" || ext === "mdx") {
		return markdown();
	}
	// YAML, TOML, Rust, Python: plain text (no legacy-modes available in bundle)
	return null;
}

function isMarkdownFile(filePath: string): boolean {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	return ext === "md" || ext === "mdx";
}

export function Editor({ filePath, badge, readOnly = false }: EditorProps) {
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	/** Content state — used for MD preview and initial doc load only */
	const [content, setContent] = useState("");
	const [previewMode, setPreviewMode] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;
	/** Track whether the editor was just loaded so we don't trigger double-sync */
	const justLoadedRef = useRef(false);
	const isMd = filePath ? isMarkdownFile(filePath) : false;

	// ── Load file ─────────────────────────────────────────────────────────
	useEffect(() => {
		if (!filePath) {
			setContent("");
			return;
		}
		const thisPath = filePath;
		invoke<string>("workspace_read_file", { path: thisPath })
			.then((text) => {
				// Guard against stale response when user switches files quickly
				if (filePathRef.current !== thisPath) return;
				justLoadedRef.current = true;
				setContent(text);
				Logger.info("Editor", "File loaded", { path: thisPath, length: text.length });
			})
			.catch((e) => {
				if (filePathRef.current !== thisPath) return;
				justLoadedRef.current = true;
				Logger.error("Editor", "Failed to load file", { path: thisPath, error: String(e) });
				setContent(`// Error loading file: ${String(e)}`);
			});
	}, [filePath]);

	// ── Save ──────────────────────────────────────────────────────────────
	const saveFile = useCallback(
		async (text: string) => {
			if (!filePath || readOnly) return;
			setSaving(true);
			setSaveError("");
			try {
				await invoke("workspace_write_file", { path: filePath, content: text });
				Logger.info("Editor", "File saved", { path: filePath });
			} catch (e) {
				setSaveError(String(e));
				Logger.error("Editor", "Save failed", { path: filePath, error: String(e) });
			} finally {
				setSaving(false);
			}
		},
		[filePath, readOnly],
	);

	// ── Setup CodeMirror ──────────────────────────────────────────────────
	useEffect(() => {
		if (!editorRef.current || previewMode) return;

		const langExt = filePath ? getLanguageExtension(filePath) : null;

		const saveKeymap = keymap.of([
			{
				key: "Ctrl-s",
				preventDefault: true,
				run: (view) => {
					const text = view.state.doc.toString();
					void saveFile(text);
					return true;
				},
			},
		]);

		const extensions = [
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			saveKeymap,
			lineNumbers(),
			oneDark,
			EditorView.lineWrapping,
			EditorView.updateListener.of((update) => {
				if (update.docChanged && !readOnly) {
					const text = update.state.doc.toString();
					// Don't trigger autosave on the initial load sync
					if (justLoadedRef.current) {
						justLoadedRef.current = false;
						return;
					}
					// Autosave debounce
					if (autosaveTimerRef.current) {
						clearTimeout(autosaveTimerRef.current);
					}
					autosaveTimerRef.current = setTimeout(() => {
						void saveFile(text);
					}, AUTOSAVE_DEBOUNCE_MS);
				}
			}),
			...(readOnly ? [EditorState.readOnly.of(true)] : []),
			...(langExt ? [langExt] : []),
		];

		const view = new EditorView({
			state: EditorState.create({
				doc: content,
				extensions,
			}),
			parent: editorRef.current,
		});

		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// content excluded intentionally — we update it via transaction below
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filePath, readOnly, previewMode, saveFile]);

	// ── Sync content into existing editor when file changes ───────────────
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const currentDoc = view.state.doc.toString();
		if (currentDoc !== content) {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: content,
				},
			});
		}
	}, [content]);

	// ── Cleanup autosave timer ─────────────────────────────────────────────
	useEffect(() => {
		return () => {
			if (autosaveTimerRef.current) {
				clearTimeout(autosaveTimerRef.current);
			}
		};
	}, []);

	// ── Empty state ───────────────────────────────────────────────────────
	if (!filePath) {
		return (
			<div className="workspace-editor workspace-editor--empty">
				<div className="workspace-editor__empty-hint">
					← 파일 탐색기에서 파일을 선택하거나 세션 카드를 클릭하세요
				</div>
			</div>
		);
	}

	const shortName = filePath.split("/").pop() ?? filePath;

	return (
		<div className="workspace-editor">
			{/* Header bar */}
			<div className="workspace-editor__header">
				<span className="workspace-editor__filename">{shortName}</span>
				{badge && <span className="workspace-editor__badge">{badge}</span>}
				{saving && <span className="workspace-editor__saving">저장 중…</span>}
				{saveError && (
					<span className="workspace-editor__error" title={saveError}>
						저장 실패
					</span>
				)}
				{readOnly && <span className="workspace-editor__readonly">읽기 전용</span>}
				{isMd && (
					<button
						type="button"
						className={`workspace-editor__preview-btn${previewMode ? " workspace-editor__preview-btn--active" : ""}`}
						onClick={() => setPreviewMode((p) => !p)}
						title={previewMode ? "편집 모드로 전환" : "미리보기 모드로 전환"}
					>
						{previewMode ? "편집" : "미리보기"}
					</button>
				)}
			</div>

			{/* Editor / Preview area */}
			{previewMode && isMd ? (
				<div className="workspace-editor__preview">
					<ReactMarkdown>{content}</ReactMarkdown>
				</div>
			) : (
				<div ref={editorRef} className="workspace-editor__codemirror" />
			)}
		</div>
	);
}
