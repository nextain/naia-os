import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

interface DirEntry {
	name: string;
	path: string;
	is_dir: boolean;
	children: DirEntry[] | null;
}

interface QuickOpenProps {
	workspaceRoot: string;
	onSelect: (path: string) => void;
	onClose: () => void;
}

/** Maximum depth for recursive file listing */
const MAX_DEPTH = 6;
/** Maximum number of results to display */
const MAX_RESULTS = 50;

async function collectFiles(
	root: string,
	depth: number,
): Promise<string[]> {
	if (depth > MAX_DEPTH) return [];
	try {
		const entries = await invoke<DirEntry[]>("workspace_list_dirs", {
			parent: root,
		});
		const results: string[] = [];
		for (const entry of entries) {
			if (entry.is_dir) {
				const children = await collectFiles(entry.path, depth + 1);
				results.push(...children);
			} else {
				results.push(entry.path);
			}
		}
		return results;
	} catch {
		return [];
	}
}

/** Simple fuzzy match: all query characters must appear in order in the target */
function fuzzyMatch(query: string, target: string): number {
	const q = query.toLowerCase();
	const t = target.toLowerCase();
	let qi = 0;
	let score = 0;
	let lastMatch = -1;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) {
			// Consecutive matches score higher
			score += lastMatch === ti - 1 ? 2 : 1;
			// Bonus for matching after separator
			if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === "-" || t[ti - 1] === "_") {
				score += 3;
			}
			lastMatch = ti;
			qi++;
		}
	}
	return qi === q.length ? score : -1;
}

export function QuickOpen({ workspaceRoot, onSelect, onClose }: QuickOpenProps) {
	const [query, setQuery] = useState("");
	const [files, setFiles] = useState<string[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Load file list on mount
	useEffect(() => {
		let cancelled = false;
		collectFiles(workspaceRoot, 0).then((f) => {
			if (!cancelled) setFiles(f);
		});
		return () => { cancelled = true; };
	}, [workspaceRoot]);

	// Filter and sort results
	const results = query.trim()
		? files
				.map((f) => {
					const rel = f.startsWith(workspaceRoot)
						? f.slice(workspaceRoot.length + 1)
						: f;
					return { path: f, rel, score: fuzzyMatch(query, rel) };
				})
				.filter((r) => r.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, MAX_RESULTS)
		: files
				.slice(0, MAX_RESULTS)
				.map((f) => ({
					path: f,
					rel: f.startsWith(workspaceRoot) ? f.slice(workspaceRoot.length + 1) : f,
					score: 0,
				}));

	// Reset selection when query changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [query]);

	// Scroll selected item into view
	useEffect(() => {
		const list = listRef.current;
		if (!list) return;
		const item = list.children[selectedIndex] as HTMLElement | undefined;
		item?.scrollIntoView?.({ block: "nearest" });
	}, [selectedIndex]);

	const handleSelect = useCallback(
		(path: string) => {
			onSelect(path);
			onClose();
		},
		[onSelect, onClose],
	);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) => results.length > 0 ? Math.min(prev + 1, results.length - 1) : 0);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((prev) => Math.max(prev - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (results[selectedIndex]) {
				handleSelect(results[selectedIndex].path);
			}
		}
	}

	return (
		<div
			className="quick-open-overlay"
			onClick={onClose}
			onKeyDown={() => {}}
		>
			<div
				className="quick-open"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<input
					ref={inputRef}
					type="text"
					className="quick-open__input"
					placeholder="파일 이름으로 검색…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
				/>
				<div ref={listRef} className="quick-open__list">
					{results.map((r, i) => (
						<div
							key={r.path}
							className={`quick-open__item${i === selectedIndex ? " quick-open__item--selected" : ""}`}
							onClick={() => handleSelect(r.path)}
							onKeyDown={() => {}}
						>
							<span className="quick-open__filename">
								{r.rel.split("/").pop()}
							</span>
							<span className="quick-open__path">{r.rel}</span>
						</div>
					))}
					{results.length === 0 && query.trim() && (
						<div className="quick-open__empty">일치하는 파일이 없습니다</div>
					)}
				</div>
			</div>
		</div>
	);
}
