import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logger } from "../../lib/logger";
import type { PanelCenterProps } from "../../lib/panel-registry";

type EmbedStatus =
	| "checking" // checking chrome + agent-browser availability
	| "no-chrome" // chrome binary not found
	| "launching" // spawning chrome + waiting for CDP + X11 embed
	| "ready" // embedded and running
	| "error"; // fatal error

export function BrowserCenterPanel({ naia }: PanelCenterProps) {
	const [status, setStatus] = useState<EmbedStatus>("checking");
	const [error, setError] = useState("");
	// viewport div is ALWAYS rendered so the ref is available when initEmbed runs
	const viewportRef = useRef<HTMLDivElement>(null);

	// ── Page info ────────────────────────────────────────────────────────────

	const refreshPageInfo = useCallback(async () => {
		try {
			const [u, t] = await invoke<[string, string]>("browser_embed_page_info");
			if (u) naia.pushContext({ type: "browser", data: { url: u, title: t } });
		} catch {
			// ignore — page info is best-effort
		}
	}, [naia]);

	// ── Embed init ───────────────────────────────────────────────────────────

	const initEmbed = useCallback(async () => {
		setStatus("launching");
		setError("");
		try {
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

	// ── Initial check + embed init ───────────────────────────────────────────

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

	// ── Periodically restore X11 focus to Chrome while ready ────────────────
	// GTK/WebKit steals focus back; this counteracts it.
	// Pauses when:
	//   • an HTML input element is focused (chat box, URL bar, etc.), OR
	//   • the Naia window itself doesn't have OS focus (user switched apps)
	useEffect(() => {
		if (status !== "ready") return;
		const id = setInterval(() => {
			// Don't steal focus from other OS windows
			if (!document.hasFocus()) return;
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

	// ── Listen for Chrome process exit → restart UI ──────────────────────────
	useEffect(() => {
		const unlisten = listen("browser_closed", () => {
			Logger.warn("BrowserCenterPanel", "Chrome process exited unexpectedly");
			setStatus("error");
			setError("Chrome이 종료되었습니다. 다시 시작하려면 아래 버튼을 누르세요.");
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// ── Sync Chrome bounds when viewport resizes ─────────────────────────────
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

	// ── Panel AI tools (panel convention) ───────────────────────────────────

	useEffect(() => {
		Logger.debug("BrowserCenterPanel", "Registering AI tool handlers");

		// skill_browser_navigate — AI navigates to a URL
		const unsubNavigate = naia.onToolCall("skill_browser_navigate", async (args) => {
			const url = String(args.url ?? "");
			if (!url) return "Error: url argument required";
			Logger.debug("BrowserCenterPanel", "skill_browser_navigate", { url });
			try {
				await invoke("browser_embed_navigate", { url });
				await refreshPageInfo();
				return `Navigated to ${url}`;
			} catch (e) {
				return `Navigation failed: ${String(e)}`;
			}
		});

		// skill_browser_snapshot — AI reads accessibility tree of current page
		const unsubSnapshot = naia.onToolCall("skill_browser_snapshot", async () => {
			Logger.debug("BrowserCenterPanel", "skill_browser_snapshot called");
			try {
				const tree = await invoke<string>("browser_snapshot");
				await refreshPageInfo();
				return tree || "(empty snapshot)";
			} catch (e) {
				return `Snapshot failed: ${String(e)}`;
			}
		});

		// skill_browser_click — AI clicks an element by @ref from snapshot
		const unsubClick = naia.onToolCall("skill_browser_click", async (args) => {
			const ref = String(args.ref ?? args.selector ?? "");
			if (!ref) return "Error: ref argument required (use @eN from snapshot)";
			Logger.debug("BrowserCenterPanel", "skill_browser_click", { ref });
			try {
				await invoke("browser_click", { selector: ref });
				await refreshPageInfo();
				return `Clicked ${ref}`;
			} catch (e) {
				return `Click failed: ${String(e)}`;
			}
		});

		// skill_browser_fill — AI fills an input element by @ref
		const unsubFill = naia.onToolCall("skill_browser_fill", async (args) => {
			const ref = String(args.ref ?? args.selector ?? "");
			const text = String(args.text ?? "");
			if (!ref) return "Error: ref argument required (use @eN from snapshot)";
			Logger.debug("BrowserCenterPanel", "skill_browser_fill", { ref, text });
			try {
				await invoke("browser_fill", { selector: ref, text });
				return `Filled ${ref} with "${text}"`;
			} catch (e) {
				return `Fill failed: ${String(e)}`;
			}
		});

		// skill_browser_get_text — AI reads text from element or page body
		const unsubGetText = naia.onToolCall("skill_browser_get_text", async (args) => {
			const ref = String(args.ref ?? args.selector ?? "");
			Logger.debug("BrowserCenterPanel", "skill_browser_get_text", { ref });
			try {
				const text = await invoke<string>("browser_get_text", { selector: ref });
				return text || "(empty)";
			} catch (e) {
				return `Get text failed: ${String(e)}`;
			}
		});

		return () => {
			Logger.debug("BrowserCenterPanel", "Unregistering AI tool handlers");
			unsubNavigate();
			unsubSnapshot();
			unsubClick();
			unsubFill();
			unsubGetText();
		};
	}, [naia, refreshPageInfo]);

	// ── No Chrome ────────────────────────────────────────────────────────────
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

	// ── Main layout — viewport div always present for ref access ─────────────
	return (
		<div className="browser-panel">
			{/* Overlay for non-ready states */}
			{status === "checking" && (
				<div className="browser-panel__overlay">
					<span className="browser-panel__overlay-text">브라우저 확인 중…</span>
				</div>
			)}
			{status === "launching" && (
				<div className="browser-panel__overlay">
					<span className="browser-panel__overlay-text">Chrome 시작 중…</span>
				</div>
			)}
			{status === "error" && (
				<div className="browser-panel__overlay browser-panel__overlay--error">
					<p className="browser-panel__overlay-text browser-panel__overlay-text--error">
						{error}
					</p>
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
			{/* onClick: restore X11 keyboard focus to Chrome after HTML element interaction */}
			<div
				ref={viewportRef}
				className="browser-panel__viewport browser-panel__viewport--embedded"
				onClick={() => {
					// Blur any focused HTML element (e.g. chat input, URL bar) so the
					// focus interval resumes and Chrome receives keyboard input.
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
					invoke("browser_embed_focus").catch(() => {});
				}}
			/>
		</div>
	);
}
