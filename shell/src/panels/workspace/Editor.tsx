import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { yaml } from "@codemirror/lang-yaml";
import { EditorState, Transaction } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import AnsiToHtml from "ansi-to-html";
import DOMPurify from "dompurify";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Logger } from "../../lib/logger";
import { AUTOSAVE_DEBOUNCE_MS } from "./constants";

type ViewMode = "editor" | "preview" | "split" | "image" | "csv" | "log";

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
		return javascript({
			typescript: ext === "ts" || ext === "tsx",
			jsx: ext === "tsx" || ext === "jsx",
		});
	}
	if (ext === "md" || ext === "mdx") return markdown();
	if (ext === "py") return python();
	if (ext === "rs") return rust();
	if (ext === "yaml" || ext === "yml") return yaml();
	if (ext === "json") return json();
	if (ext === "css" || ext === "scss" || ext === "less") return css();
	return null;
}

function isMarkdownFile(filePath: string): boolean {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	return ext === "md" || ext === "mdx";
}

function isImageFile(filePath: string): boolean {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	return ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
}

function isCsvFile(filePath: string): boolean {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	return ext === "csv";
}

function isLogFile(filePath: string): boolean {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	return ext === "log";
}

function detectViewMode(filePath: string): ViewMode {
	if (isImageFile(filePath)) return "image";
	if (isCsvFile(filePath)) return "csv";
	if (isLogFile(filePath)) return "log";
	if (isMarkdownFile(filePath)) return "preview";
	return "editor";
}

const ansiConverter = new AnsiToHtml({ escapeXML: true });

export function Editor({ filePath, badge, readOnly = false }: EditorProps) {
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	/** Content state — used for MD preview and initial doc load */
	const [content, setContent] = useState("");
	const [viewMode, setViewMode] = useState<ViewMode>("editor");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	/** Error message from a failed file load; null = no error. Shown in UI instead of editor. */
	const [loadError, setLoadError] = useState<string | null>(null);
	/** Ref mirror of loadError for synchronous updateListener access */
	const loadErrorRef = useRef(false);
	const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const filePathRef = useRef(filePath);
	filePathRef.current = filePath;
	/** Track whether the editor was just loaded so we don't trigger double-sync */
	const justLoadedRef = useRef(false);

	/** CSV sort state */
	const [sortCol, setSortCol] = useState<number | null>(null);
	const [sortAsc, setSortAsc] = useState(true);

	const isMd = filePath ? isMarkdownFile(filePath) : false;

	// ── Reset viewMode (and sort state) when file changes ────────────────
	useEffect(() => {
		setViewMode(filePath ? detectViewMode(filePath) : "editor");
		setSortCol(null);
		setSortAsc(true);
	}, [filePath]);

	// ── Load file ─────────────────────────────────────────────────────────
	useEffect(() => {
		if (!filePath) {
			setContent("");
			setLoadError(null);
			loadErrorRef.current = false;
			return;
		}
		// Images are rendered via convertFileSrc — no text read needed
		if (isImageFile(filePath)) {
			setContent("");
			setLoadError(null);
			loadErrorRef.current = false;
			return;
		}
		const thisPath = filePath;
		// Reset error state at load start (ref first — read synchronously by updateListener)
		loadErrorRef.current = false;
		setLoadError(null);
		invoke<string>("workspace_read_file", { path: thisPath })
			.then((text) => {
				// Guard against stale response when user switches files quickly
				if (filePathRef.current !== thisPath) return;
				justLoadedRef.current = true;
				loadErrorRef.current = false;
				setLoadError(null);
				setContent(text);
				Logger.info("Editor", "File loaded", {
					path: thisPath,
					length: text.length,
				});
			})
			.catch((e) => {
				if (filePathRef.current !== thisPath) return;
				// Mark load as failed — autosave is disabled while this is true.
				// Do NOT set content to the error string; show error in UI instead.
				loadErrorRef.current = true;
				setLoadError(String(e));
				Logger.error("Editor", "Failed to load file", {
					path: thisPath,
					error: String(e),
				});
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
				Logger.error("Editor", "Save failed", {
					path: filePath,
					error: String(e),
				});
			} finally {
				setSaving(false);
			}
		},
		[filePath, readOnly],
	);

	// ── Setup CodeMirror ──────────────────────────────────────────────────
	useEffect(() => {
		if (!editorRef.current || viewMode === "preview" || viewMode === "image" || viewMode === "csv" || viewMode === "log") return;

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
				if (update.docChanged) {
					// Don't trigger autosave/preview-sync on the initial load sync
					if (justLoadedRef.current) {
						justLoadedRef.current = false;
						return;
					}
					if (!readOnly) {
						const text = update.state.doc.toString();
						// Don't autosave while a file-load error is active
						if (loadErrorRef.current) return;
						// Update content state for live split-view preview
						setContent(text);
						// Autosave debounce
						if (autosaveTimerRef.current) {
							clearTimeout(autosaveTimerRef.current);
						}
						autosaveTimerRef.current = setTimeout(() => {
							void saveFile(text);
						}, AUTOSAVE_DEBOUNCE_MS);
					}
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

		// If a file was loaded while viewMode was "preview", the sync effect could not
		// clear justLoadedRef (viewRef was null at that time). Clear it now so the user's
		// first edit after switching to editor mode is not mistakenly swallowed.
		// The doc was initialised with `content` above, so no dispatch is needed.
		if (justLoadedRef.current) {
			justLoadedRef.current = false;
		}

		return () => {
			view.destroy();
			viewRef.current = null;
			// Clear any pending autosave when the view is torn down (viewMode change,
			// file switch, or unmount) to prevent stale saves after the context changes.
			if (autosaveTimerRef.current) {
				clearTimeout(autosaveTimerRef.current);
				autosaveTimerRef.current = null;
			}
		};
		// content excluded intentionally — we update it via transaction below
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filePath, readOnly, viewMode, saveFile]);

	// ── Sync content into existing editor when file changes ───────────────
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const currentDoc = view.state.doc.toString();
		const isFileLoad = justLoadedRef.current;
		if (currentDoc !== content) {
			// When the change originates from a file load (justLoadedRef=true), mark the
			// transaction as non-history so it does not pollute the undo stack.
			// The updateListener will clear justLoadedRef.current after this dispatch.
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: content,
				},
				...(isFileLoad && {
					annotations: Transaction.addToHistory.of(false),
				}),
			});
		} else if (isFileLoad) {
			// Content unchanged after file load (new file has same content as previous).
			// No dispatch needed, but clear the flag so the user's first edit is not
			// mistakenly swallowed by the justLoadedRef guard in updateListener.
			justLoadedRef.current = false;
		}
	}, [content]);

	// ── CSV: parse and sort ───────────────────────────────────────────────
	const csvResult = useMemo(() => {
		if (!isCsvFile(filePath) || !content) return null;
		return Papa.parse<string[]>(content, { skipEmptyLines: true });
	}, [filePath, content]);

	const csvRows = useMemo(() => {
		if (!csvResult || csvResult.data.length < 2) return [];
		const rows = csvResult.data.slice(1);
		if (sortCol === null) return rows;
		return [...rows].sort((a, b) => {
			const av = a[sortCol] ?? "";
			const bv = b[sortCol] ?? "";
			const cmp = av.localeCompare(bv, undefined, { numeric: true });
			return sortAsc ? cmp : -cmp;
		});
	}, [csvResult, sortCol, sortAsc]);

	// ── Log: ANSI → sanitized HTML ────────────────────────────────────────
	const logHtml = useMemo(() => {
		if (!isLogFile(filePath) || !content) return "";
		return DOMPurify.sanitize(ansiConverter.toHtml(content));
	}, [filePath, content]);

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

	// ── Load error state ──────────────────────────────────────────────────
	if (loadError) {
		return (
			<div className="workspace-editor workspace-editor--error">
				<div className="workspace-editor__header">
					<span className="workspace-editor__filename">{shortName}</span>
				</div>
				<div className="workspace-editor__load-error">
					파일을 열 수 없습니다: {loadError}
				</div>
			</div>
		);
	}

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
				{readOnly && (
					<span className="workspace-editor__readonly">읽기 전용</span>
				)}
				{isMd && viewMode === "preview" && (
					<button
						type="button"
						className="workspace-editor__view-btn"
						onClick={() => setViewMode("split")}
						title="편집 모드로 전환"
					>
						편집
					</button>
				)}
				{isMd && viewMode === "split" && (
					<>
						<button
							type="button"
							className="workspace-editor__view-btn"
							onClick={() => setViewMode("preview")}
							title="미리보기만 표시"
						>
							미리보기만
						</button>
						<button
							type="button"
							className="workspace-editor__view-btn workspace-editor__view-btn--active"
							onClick={() => setViewMode("editor")}
							title="편집기만 표시"
						>
							편집만
						</button>
					</>
				)}
				{isMd && viewMode === "editor" && (
					<button
						type="button"
						className="workspace-editor__view-btn"
						onClick={() => setViewMode("preview")}
						title="미리보기 모드로 전환"
					>
						미리보기
					</button>
				)}
			</div>

			{/* Viewer / Editor area */}
			{viewMode === "image" ? (
				<div className="workspace-editor__image-viewer">
					<img
						src={convertFileSrc(filePath)}
						alt={shortName}
						className="workspace-editor__image"
					/>
				</div>
			) : viewMode === "csv" ? (
				<div className="workspace-editor__csv-viewer">
					{csvResult && csvResult.data.length > 0 ? (
						<table className="workspace-editor__csv-table">
							<thead>
								<tr>
									{csvResult.data[0].map((header, i) => (
										<th
											key={i}
											className="workspace-editor__csv-th"
											onClick={() => {
												if (sortCol === i) {
													setSortAsc((prev) => !prev);
												} else {
													setSortCol(i);
													setSortAsc(true);
												}
											}}
										>
											{header}
											{sortCol === i ? (sortAsc ? " ▲" : " ▼") : ""}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{csvRows.map((row, ri) => (
									<tr key={ri}>
										{row.map((cell, ci) => (
											<td key={ci} className="workspace-editor__csv-td">
												{cell}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<div className="workspace-editor__empty-hint">CSV 데이터가 없습니다</div>
					)}
				</div>
			) : viewMode === "log" ? (
				<div className="workspace-editor__log-viewer">
					{/* eslint-disable-next-line react/no-danger */}
					<pre
						className="workspace-editor__log-pre"
						dangerouslySetInnerHTML={{ __html: logHtml }}
					/>
				</div>
			) : viewMode === "preview" ? (
				<div className="workspace-editor__preview">
					<ReactMarkdown>{content}</ReactMarkdown>
				</div>
			) : viewMode === "split" ? (
				<div className="workspace-editor__body--split">
					<div
						ref={editorRef}
						className="workspace-editor__codemirror workspace-editor__codemirror--half"
					/>
					<div className="workspace-editor__preview workspace-editor__preview--half">
						<ReactMarkdown>{content}</ReactMarkdown>
					</div>
				</div>
			) : (
				<div ref={editorRef} className="workspace-editor__codemirror" />
			)}
		</div>
	);
}
