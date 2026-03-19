import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelCenterProps } from "../../lib/panel-registry";

type EmbedStatus =
	| "checking"   // checking chrome availability
	| "no-chrome"  // chrome binary not found
	| "launching"  // spawning chrome + waiting for CDP
	| "ready"      // embedded and running
	| "error";     // fatal error

export function BrowserCenterPanel({ naia }: PanelCenterProps) {
	const [status, setStatus] = useState<EmbedStatus>("checking");
	const [error, setError] = useState("");
	const [url, setUrl] = useState("");
	const [inputUrl, setInputUrl] = useState("");
	const [_title, setTitle] = useState("");
	const viewportRef = useRef<HTMLDivElement>(null);

	const refreshPageInfo = useCallback(async () => {
		try {
			const [u, t] = await invoke<[string, string]>("browser_embed_page_info");
			setUrl(u);
			setInputUrl(u);
			setTitle(t);
			if (u) naia.pushContext({ type: "browser", data: { url: u, title: t } });
		} catch {
			// ignore
		}
	}, [naia]);

	const initEmbed = useCallback(async () => {
		setStatus("launching");
		setError("");
		try {
			const el = viewportRef.current;
			if (!el) throw new Error("viewport ref not ready");
			const rect = el.getBoundingClientRect();
			await invoke("browser_embed_init", {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
			});
			setStatus("ready");
			await refreshPageInfo();
		} catch (e) {
			setError(String(e));
			setStatus("error");
		}
	}, [refreshPageInfo]);

	// Initial check + embed init
	useEffect(() => {
		invoke<boolean>("browser_check").then((ok) => {
			if (!ok) {
				setStatus("no-chrome");
				return;
			}
			initEmbed();
		});

		return () => {
			invoke("browser_embed_close").catch(() => {});
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sync Chrome bounds when viewport resizes
	useEffect(() => {
		if (status !== "ready") return;
		const el = viewportRef.current;
		if (!el) return;
		const obs = new ResizeObserver(() => {
			const rect = el.getBoundingClientRect();
			invoke("browser_embed_resize", {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
			}).catch(() => {});
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, [status]);

	const navigate = useCallback(
		async (target: string) => {
			const normalized =
				target.startsWith("http") || target.startsWith("about:")
					? target
					: `https://${target}`;
			try {
				await invoke("browser_embed_navigate", { url: normalized });
				setTimeout(() => void refreshPageInfo(), 800);
			} catch (e) {
				setError(String(e));
			}
		},
		[refreshPageInfo],
	);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputUrl.trim()) void navigate(inputUrl.trim());
	};

	// ── No Chrome ──────────────────────────────────────────────────────────────
	if (status === "no-chrome") {
		return (
			<div className="browser-panel browser-panel--install">
				<div className="browser-panel__install-box">
					<p className="browser-panel__install-title">Chrome 미설치</p>
					<p className="browser-panel__install-desc">
						내장 브라우저를 사용하려면 Google Chrome이 필요합니다.
					</p>
					<p className="browser-panel__install-desc">
						<code>sudo apt install google-chrome-stable</code>
					</p>
				</div>
			</div>
		);
	}

	// ── Checking / Launching ───────────────────────────────────────────────────
	if (status === "checking" || status === "launching") {
		return (
			<div className="browser-panel">
				<div className="browser-panel__empty">
					{status === "checking" ? "브라우저 확인 중…" : "Chrome 시작 중…"}
				</div>
			</div>
		);
	}

	// ── Error ──────────────────────────────────────────────────────────────────
	if (status === "error") {
		return (
			<div className="browser-panel browser-panel--install">
				<div className="browser-panel__install-box">
					<p className="browser-panel__install-title">브라우저 오류</p>
					<p className="browser-panel__error">{error}</p>
					<button
						type="button"
						className="browser-panel__install-btn"
						onClick={initEmbed}
					>
						다시 시도
					</button>
				</div>
			</div>
		);
	}

	// ── Ready ──────────────────────────────────────────────────────────────────
	return (
		<div className="browser-panel">
			<div className="browser-panel__toolbar">
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() =>
						invoke("browser_embed_back")
							.then(() => setTimeout(() => void refreshPageInfo(), 400))
							.catch(() => {})
					}
					title="뒤로"
				>
					←
				</button>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() =>
						invoke("browser_embed_forward")
							.then(() => setTimeout(() => void refreshPageInfo(), 400))
							.catch(() => {})
					}
					title="앞으로"
				>
					→
				</button>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() =>
						invoke("browser_embed_reload")
							.then(() => setTimeout(() => void refreshPageInfo(), 800))
							.catch(() => {})
					}
					title="새로고침"
				>
					↺
				</button>
				<form className="browser-panel__url-form" onSubmit={handleSubmit}>
					<input
						type="text"
						className="browser-panel__url-input"
						value={inputUrl}
						onChange={(e) => setInputUrl(e.target.value)}
						placeholder="주소를 입력하세요…"
					/>
				</form>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => { /* bookmark — BrowserMetaPanel wired in issue-89 merge */ }}
					title="북마크"
					disabled={!url}
				>
					☆
				</button>
			</div>

			{/* Chrome is embedded here via XReparentWindow — this div defines the bounds */}
			<div
				ref={viewportRef}
				className="browser-panel__viewport browser-panel__viewport--embedded"
			/>
		</div>
	);
}
