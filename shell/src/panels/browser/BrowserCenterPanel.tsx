import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logger } from "../../lib/logger";
import type { PanelCenterProps } from "../../lib/panel-registry";

type EmbedStatus =
	| "checking" // checking chrome availability
	| "no-chrome" // chrome binary not found
	| "launching" // spawning chrome + waiting for CDP
	| "ready" // embedded and running
	| "error"; // fatal error

export function BrowserCenterPanel({ naia }: PanelCenterProps) {
	const [status, setStatus] = useState<EmbedStatus>("checking");
	const [error, setError] = useState("");
	// viewport div is ALWAYS rendered so the ref is available when initEmbed runs
	const viewportRef = useRef<HTMLDivElement>(null);

	const refreshPageInfo = useCallback(async () => {
		try {
			const [u, t] = await invoke<[string, string]>("browser_embed_page_info");
			if (u) naia.pushContext({ type: "browser", data: { url: u, title: t } });
		} catch {
			// ignore
		}
	}, [naia]);

	const initEmbed = useCallback(async () => {
		setStatus("launching");
		setError("");
		try {
			// viewport div is always rendered — guaranteed to be non-null here
			const el = viewportRef.current!;
			const rect = el.getBoundingClientRect();
			await invoke("browser_embed_init", {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
			});
			Logger.info("BrowserCenterPanel", "Chrome embedded successfully");
			setStatus("ready");
			await refreshPageInfo();
		} catch (e) {
			Logger.error("BrowserCenterPanel", "embed failed", { error: String(e) });
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
		// initEmbed is stable — only run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Periodically restore X11 focus to Chrome while it's active.
	// GTK/WebKit steals focus back; this counteracts it.
	// Pauses when an HTML input element is focused (chat, etc.).
	useEffect(() => {
		if (status !== "ready") return;
		const id = setInterval(() => {
			const active = document.activeElement;
			const isHtmlInput =
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable);
			if (!isHtmlInput) {
				invoke("browser_embed_focus").catch(() => {});
			}
		}, 1500);
		return () => clearInterval(id);
	}, [status]);

	// Listen for Chrome process exit → show restart UI
	useEffect(() => {
		const unlisten = listen("browser_closed", () => {
			Logger.warn("BrowserCenterPanel", "Chrome process exited unexpectedly");
			setStatus("error");
			setError(
				"Chrome이 종료되었습니다. 다시 시작하려면 아래 버튼을 누르세요.",
			);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
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

	// ── Main layout — viewport div always present for ref access ───────────────
	return (
		<div className="browser-panel">
			{/* Overlay for non-ready states */}
			{status === "checking" && (
				<div className="browser-panel__overlay">
					<div className="browser-panel__empty">브라우저 확인 중…</div>
				</div>
			)}
			{status === "launching" && (
				<div className="browser-panel__overlay">
					<div className="browser-panel__empty">Chrome 시작 중…</div>
				</div>
			)}
			{status === "error" && (
				<div className="browser-panel__overlay browser-panel__overlay--error">
					<p className="browser-panel__error">{error}</p>
					<button
						type="button"
						className="browser-panel__install-btn"
						onClick={initEmbed}
					>
						다시 시도
					</button>
				</div>
			)}

			{/* Chrome is embedded here via XReparentWindow — always rendered */}
			{/* onClick: restore X11 keyboard focus to Chrome after interacting with HTML elements */}
			<div
				ref={viewportRef}
				className="browser-panel__viewport browser-panel__viewport--embedded"
				onClick={() => {
					// Blur any focused HTML element (e.g. chat input) so the
					// focus interval resumes and Chrome keeps keyboard input.
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
					invoke("browser_embed_focus").catch(() => {});
				}}
			/>
		</div>
	);
}
