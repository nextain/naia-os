import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { addAllowedTool } from "../../lib/config";
import { Logger } from "../../lib/logger";
import { panelRegistry } from "../../lib/panel-registry";
import type { PanelCenterProps } from "../../lib/panel-registry";
import { usePanelStore } from "../../stores/panel";

// ─── Panel API ───────────────────────────────────────────────────────────────

/**
 * Programmatic API exposed by the Browser panel.
 * Access via `panelRegistry.getApi<BrowserPanelApi>("browser")`.
 */
export interface BrowserPanelApi {
	/** Navigate the embedded Chrome to a URL. */
	navigate: (url: string) => void;
	/** Switch the center panel to Browser. */
	activatePanel: () => void;
	/** Hide the embedded Chrome X11 window. */
	hide: () => void;
	/** Show the embedded Chrome X11 window. */
	show: () => void;
}

type EmbedStatus =
	| "checking" // checking chrome + agent-browser availability
	| "no-chrome" // chrome binary not found
	| "launching" // spawning chrome + waiting for CDP + X11 embed
	| "ready" // embedded and running
	| "error"; // fatal error

/**
 * Per-tool AI permission state.
 * Each key maps to one or more agent-browser commands.
 * Persisted to localStorage under "browser-tool-perms".
 */
interface BrowserToolPerms {
	navigate: boolean; // skill_browser_navigate (open URL)
	back: boolean; // skill_browser_back
	forward: boolean; // skill_browser_forward
	reload: boolean; // skill_browser_reload
	click: boolean; // skill_browser_click
	fill: boolean; // skill_browser_fill
	scroll: boolean; // skill_browser_scroll
	press: boolean; // skill_browser_press (keyboard)
	snapshot: boolean; // skill_browser_snapshot (accessibility tree)
	getText: boolean; // skill_browser_get_text
	screenshot: boolean; // skill_browser_screenshot
	eval: boolean; // skill_browser_eval (JS execution — high risk)
}

const PERMS_KEY = "browser-tool-perms";
const TOOLBAR_COLLAPSED_KEY = "browser-toolbar-collapsed";
const DEFAULT_PERMS: BrowserToolPerms = {
	navigate: true,
	back: true,
	forward: true,
	reload: true,
	click: true,
	fill: true,
	scroll: true,
	press: true,
	snapshot: true,
	getText: true,
	screenshot: true,
	eval: false, // JS eval off by default (high risk)
};

function loadPerms(): BrowserToolPerms {
	try {
		const raw = localStorage.getItem(PERMS_KEY);
		if (raw) return { ...DEFAULT_PERMS, ...JSON.parse(raw) };
	} catch {}
	return { ...DEFAULT_PERMS };
}

function savePerms(p: BrowserToolPerms) {
	try {
		localStorage.setItem(PERMS_KEY, JSON.stringify(p));
	} catch {}
}

type PermKey = keyof BrowserToolPerms;

/** Human-readable label for each permission */
const PERM_LABELS: Record<PermKey, string> = {
	navigate: "탐색",
	back: "뒤로",
	forward: "앞으로",
	reload: "새로고침",
	click: "클릭",
	fill: "입력",
	scroll: "스크롤",
	press: "키보드",
	snapshot: "스냅샷",
	getText: "읽기",
	screenshot: "스크린샷",
	eval: "JS실행",
};

const PERM_TITLES: Record<PermKey, string> = {
	navigate: "URL 탐색 허용",
	back: "뒤로 가기 허용",
	forward: "앞으로 가기 허용",
	reload: "페이지 새로고침 허용",
	click: "요소 클릭 허용",
	fill: "텍스트 입력 허용",
	scroll: "페이지 스크롤 허용",
	press: "키보드 입력 허용",
	snapshot: "접근성 트리 읽기 허용",
	getText: "페이지 텍스트 읽기 허용",
	screenshot: "스크린샷 촬영 허용",
	eval: "JavaScript 실행 허용 (위험)",
};

const PERM_KEYS: PermKey[] = [
	"navigate",
	"back",
	"forward",
	"reload",
	"click",
	"fill",
	"scroll",
	"press",
	"snapshot",
	"getText",
	"screenshot",
	"eval",
];

/** All 12 skill_browser_* tool names — globally auto-allowed to bypass PermissionModal */
const BROWSER_TOOL_NAMES = [
	"skill_browser_navigate",
	"skill_browser_back",
	"skill_browser_forward",
	"skill_browser_reload",
	"skill_browser_click",
	"skill_browser_fill",
	"skill_browser_scroll",
	"skill_browser_press",
	"skill_browser_snapshot",
	"skill_browser_get_text",
	"skill_browser_screenshot",
	"skill_browser_eval",
] as const;

/** Chrome browser-level permissions (granted via CDP) */
interface ChromePerms {
	mic: boolean;
	camera: boolean;
	notifications: boolean;
}

const CHROME_PERMS_KEY = "browser-chrome-perms";
const DEFAULT_CHROME_PERMS: ChromePerms = {
	mic: false,
	camera: false,
	notifications: false,
};

function loadChromePerms(): ChromePerms {
	try {
		const raw = localStorage.getItem(CHROME_PERMS_KEY);
		if (raw) return { ...DEFAULT_CHROME_PERMS, ...JSON.parse(raw) };
	} catch {}
	return { ...DEFAULT_CHROME_PERMS };
}

function saveChromePerms(p: ChromePerms) {
	try {
		localStorage.setItem(CHROME_PERMS_KEY, JSON.stringify(p));
	} catch {}
}

export function BrowserCenterPanel({ naia }: PanelCenterProps) {
	const [status, setStatus] = useState<EmbedStatus>("checking");
	const [error, setError] = useState("");
	// viewport div is ALWAYS rendered so the ref is available when initEmbed runs
	const viewportRef = useRef<HTMLDivElement>(null);

	// AI tool permissions — loaded from localStorage, auto-saved on change
	const [toolPerms, setToolPerms] = useState<BrowserToolPerms>(loadPerms);
	const toolPermsRef = useRef(toolPerms);
	useEffect(() => {
		toolPermsRef.current = toolPerms;
		savePerms(toolPerms);
	}, [toolPerms]);

	// Chrome browser-level permissions (CDP grant/reset)
	const [chromePerms, setChromePerms] = useState<ChromePerms>(loadChromePerms);
	function setChromePermToggle(key: keyof ChromePerms, on: boolean) {
		setChromePerms((p) => {
			const next = { ...p, [key]: on };
			saveChromePerms(next);
			invoke("browser_set_permission", { permission: key, granted: on }).catch(
				(e) => Logger.warn("BrowserCenterPanel", `set_permission ${key} failed`, { error: String(e) }),
			);
			return next;
		});
	}

	// Toolbar collapsed state — persisted
	const [toolbarCollapsed, setToolbarCollapsed] = useState(
		() => localStorage.getItem(TOOLBAR_COLLAPSED_KEY) === "1",
	);
	function toggleToolbar() {
		setToolbarCollapsed((c) => {
			const next = !c;
			localStorage.setItem(TOOLBAR_COLLAPSED_KEY, next ? "1" : "0");
			return next;
		});
	}

	// Master toggle
	const allEnabled = PERM_KEYS.every((k) => toolPerms[k]);
	const someEnabled = PERM_KEYS.some((k) => toolPerms[k]);
	function toggleAll(on: boolean) {
		const next = { ...DEFAULT_PERMS };
		for (const k of PERM_KEYS) next[k] = on;
		setToolPerms(next);
	}

	function setOne(key: PermKey, on: boolean) {
		setToolPerms((p) => ({ ...p, [key]: on }));
	}

	// ── Page info ─────────────────────────────────────────────────────────────

	const refreshPageInfo = useCallback(async () => {
		try {
			const [u, t] = await invoke<[string, string]>("browser_embed_page_info");
			if (u) naia.pushContext({ type: "browser", data: { url: u, title: t } });
		} catch {
			// ignore — page info is best-effort
		}
	}, [naia]);

	// ── Embed init ────────────────────────────────────────────────────────────

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

	// ── Initial check + embed init ────────────────────────────────────────────

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

	// ── Auto-detect Chrome install while showing "no-chrome" ──────────────────
	useEffect(() => {
		if (status !== "no-chrome") return;
		const timer = setInterval(() => {
			invoke<boolean>("browser_check").then((ok) => {
				if (ok) {
					clearInterval(timer);
					initEmbed();
				}
			});
		}, 5000);
		return () => clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status]);

	// ── Focus: HTML input focused → route keyboard to Tauri shell ────────────
	useEffect(() => {
		const onFocusIn = (e: FocusEvent) => {
			const target = e.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			) {
				invoke("browser_shell_focus").catch(() => {});
			}
		};
		document.addEventListener("focusin", onFocusIn);
		return () => document.removeEventListener("focusin", onFocusIn);
	}, []);

	// ── Focus: app window regains OS focus → restore Chrome focus ─────────────
	useEffect(() => {
		if (status !== "ready") return;
		const onWindowFocus = () => {
			const active = document.activeElement;
			const isHtmlInput =
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable);
			if (!isHtmlInput) invoke("browser_embed_focus").catch(() => {});
		};
		window.addEventListener("focus", onWindowFocus);
		return () => window.removeEventListener("focus", onWindowFocus);
	}, [status]);

	// ── Periodically restore X11 focus to Chrome while ready ─────────────────
	useEffect(() => {
		if (status !== "ready") return;
		const id = setInterval(() => {
			if (!document.hasFocus()) return;
			const active = document.activeElement;
			const isHtmlInput =
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable);
			if (!isHtmlInput) invoke("browser_embed_focus").catch(() => {});
		}, 1500);
		return () => clearInterval(id);
	}, [status]);

	// ── Listen for Chrome process exit ────────────────────────────────────────
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

	// ── Sync Chrome bounds when viewport resizes ──────────────────────────────
	useEffect(() => {
		if (status !== "ready") return;
		const el = viewportRef.current;
		if (!el) return;
		const syncBounds = () => {
			const rect = el.getBoundingClientRect();
			invoke("browser_embed_resize", {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
			}).catch(() => {});
		};
		const obs = new ResizeObserver(syncBounds);
		obs.observe(el);
		syncBounds(); // immediately sync after embed
		return () => obs.disconnect();
	}, [status]);

	// ── Panel API (BrowserPanelApi) ───────────────────────────────────────────
	useEffect(() => {
		panelRegistry.updateApi("browser", {
			navigate: (url: string) => {
				invoke("browser_embed_navigate", { url }).catch(() => {});
			},
			activatePanel: () =>
				usePanelStore.getState().setActivePanel("browser"),
			hide: () => invoke("browser_embed_hide").catch(() => {}),
			show: () => invoke("browser_embed_show").catch(() => {}),
		} satisfies BrowserPanelApi);
		return () => panelRegistry.updateApi("browser", undefined);
	}, []); // stable: invoke and store never change

	// ── Auto-allow browser tools globally (no PermissionModal for these) ─────
	// Called once on mount so the tools are in allowedTools config even when
	// this component is unmounted (e.g. user on another panel).
	useEffect(() => {
		for (const name of BROWSER_TOOL_NAMES) {
			addAllowedTool(name);
		}
		Logger.debug("BrowserCenterPanel", "Browser tools auto-allowed");
	}, []);

	// ── Panel AI tools ────────────────────────────────────────────────────────

	useEffect(() => {
		Logger.debug("BrowserCenterPanel", "Registering AI tool handlers");

		const p = toolPermsRef;
		const denied = (label: string) =>
			`'${label}' 도구가 비활성화되어 있습니다. 패널 하단 AI 도구 설정에서 켜주세요.`;

		// navigate
		const u1 = naia.onToolCall("skill_browser_navigate", async (args) => {
			if (!p.current.navigate) return denied("탐색");
			const url = String(args.url ?? "");
			if (!url) return "Error: url required";
			try {
				await invoke("browser_embed_navigate", { url });
				await refreshPageInfo();
				return `Navigated to ${url}`;
			} catch (e) {
				return `Navigation failed: ${String(e)}`;
			}
		});

		// back
		const u2 = naia.onToolCall("skill_browser_back", async () => {
			if (!p.current.back) return denied("뒤로");
			try {
				await invoke("browser_embed_back");
				await refreshPageInfo();
				return "Navigated back";
			} catch (e) {
				return `Back failed: ${String(e)}`;
			}
		});

		// forward
		const u3 = naia.onToolCall("skill_browser_forward", async () => {
			if (!p.current.forward) return denied("앞으로");
			try {
				await invoke("browser_embed_forward");
				await refreshPageInfo();
				return "Navigated forward";
			} catch (e) {
				return `Forward failed: ${String(e)}`;
			}
		});

		// reload
		const u4 = naia.onToolCall("skill_browser_reload", async () => {
			if (!p.current.reload) return denied("새로고침");
			try {
				await invoke("browser_embed_reload");
				await refreshPageInfo();
				return "Page reloaded";
			} catch (e) {
				return `Reload failed: ${String(e)}`;
			}
		});

		// snapshot
		const u5 = naia.onToolCall("skill_browser_snapshot", async () => {
			if (!p.current.snapshot) return denied("스냅샷");
			try {
				const tree = await invoke<string>("browser_snapshot");
				await refreshPageInfo();
				return tree || "(empty snapshot)";
			} catch (e) {
				return `Snapshot failed: ${String(e)}`;
			}
		});

		// click
		const u6 = naia.onToolCall("skill_browser_click", async (args) => {
			if (!p.current.click) return denied("클릭");
			const ref = String(args.ref ?? args.selector ?? "");
			if (!ref) return "Error: ref required (use @eN from snapshot)";
			try {
				await invoke("browser_click", { selector: ref });
				await refreshPageInfo();
				return `Clicked ${ref}`;
			} catch (e) {
				return `Click failed: ${String(e)}`;
			}
		});

		// fill
		const u7 = naia.onToolCall("skill_browser_fill", async (args) => {
			if (!p.current.fill) return denied("입력");
			const ref = String(args.ref ?? args.selector ?? "");
			const text = String(args.text ?? "");
			if (!ref) return "Error: ref required (use @eN from snapshot)";
			try {
				await invoke("browser_fill", { selector: ref, text });
				return `Filled ${ref} with "${text}"`;
			} catch (e) {
				return `Fill failed: ${String(e)}`;
			}
		});

		// get_text
		const u8 = naia.onToolCall("skill_browser_get_text", async (args) => {
			if (!p.current.getText) return denied("읽기");
			const ref = String(args.ref ?? args.selector ?? "");
			try {
				const text = await invoke<string>("browser_get_text", { selector: ref });
				return text || "(empty)";
			} catch (e) {
				return `Get text failed: ${String(e)}`;
			}
		});

		// scroll
		const u9 = naia.onToolCall("skill_browser_scroll", async (args) => {
			if (!p.current.scroll) return denied("스크롤");
			const dir = String(args.direction ?? args.dir ?? "down");
			const px = Number(args.pixels ?? args.px ?? 300);
			try {
				await invoke("browser_scroll", { direction: dir, pixels: px });
				return `Scrolled ${dir} ${px}px`;
			} catch (e) {
				return `Scroll failed: ${String(e)}`;
			}
		});

		// press
		const u10 = naia.onToolCall("skill_browser_press", async (args) => {
			if (!p.current.press) return denied("키보드");
			const key = String(args.key ?? "");
			if (!key) return "Error: key required (e.g. Enter, Tab, Control+a)";
			try {
				await invoke("browser_press", { key });
				return `Pressed ${key}`;
			} catch (e) {
				return `Press failed: ${String(e)}`;
			}
		});

		// screenshot
		const u11 = naia.onToolCall("skill_browser_screenshot", async () => {
			if (!p.current.screenshot) return denied("스크린샷");
			try {
				const path = await invoke<string>("browser_screenshot_path");
				return `Screenshot saved: ${path}`;
			} catch (e) {
				return `Screenshot failed: ${String(e)}`;
			}
		});

		// eval
		const u12 = naia.onToolCall("skill_browser_eval", async (args) => {
			if (!p.current.eval) return denied("JS실행");
			const js = String(args.js ?? args.script ?? "");
			if (!js) return "Error: js argument required";
			try {
				const result = await invoke<string>("browser_eval", { js });
				return result ?? "null";
			} catch (e) {
				return `Eval failed: ${String(e)}`;
			}
		});

		return () => {
			Logger.debug("BrowserCenterPanel", "Unregistering AI tool handlers");
			u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); u11(); u12();
		};
	}, [naia, refreshPageInfo]);

	// ── No Chrome ────────────────────────────────────────────────────────────
	if (status === "no-chrome") {
		const isWindows = navigator.userAgent.includes("Windows");
		const isMac = navigator.userAgent.includes("Mac");
		return (
			<div className="browser-panel browser-panel--install">
				<div className="browser-panel__install-box">
					<p className="browser-panel__install-title">Chrome 미설치</p>
					<p className="browser-panel__install-desc">
						내장 브라우저를 사용하려면 Google Chrome이 필요합니다.
					</p>
					{isWindows || isMac ? (
						<button
							className="browser-panel__install-btn"
							onClick={() => {
								import("@tauri-apps/plugin-opener").then((opener) =>
									opener.openUrl("https://www.google.com/chrome/"),
								);
							}}
						>
							Chrome 다운로드
						</button>
					) : (
						<p className="browser-panel__install-desc">
							<code>flatpak install com.google.Chrome</code>
						</p>
					)}
				</div>
			</div>
		);
	}

	// ── Main layout ──────────────────────────────────────────────────────────
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

			{/* Chrome embedded via XReparentWindow — always rendered */}
			<div
				ref={viewportRef}
				className="browser-panel__viewport browser-panel__viewport--embedded"
				onClick={() => {
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
					invoke("browser_embed_focus").catch(() => {});
				}}
			/>

			{/* AI tool permission toolbar — HTML layer, always below Chrome's X11 area */}
			{status === "ready" && (
				<div
					className={`browser-panel__ai-toolbar${toolbarCollapsed ? " browser-panel__ai-toolbar--collapsed" : ""}`}
				>
					{toolbarCollapsed ? (
						// Collapsed: just show expand button
						<button
							type="button"
							className="browser-panel__ai-collapse"
							title="AI 도구 설정 펼치기"
							onClick={toggleToolbar}
						>
							▲ AI
						</button>
					) : (
						<>
							<span className="browser-panel__ai-label">AI</span>

							{/* Master toggle */}
							<label
								className="browser-panel__ai-toggle"
								title="모두 허용 / 차단"
							>
								<input
									type="checkbox"
									className="browser-panel__ai-switch"
									checked={allEnabled}
									ref={(el) => {
										if (el) el.indeterminate = !allEnabled && someEnabled;
									}}
									onChange={(e) => toggleAll(e.target.checked)}
								/>
								<span className="browser-panel__ai-toggle-label">전체</span>
							</label>

							<span className="browser-panel__ai-sep" />

							{/* Individual tool toggles */}
							{PERM_KEYS.map((key) => (
								<label
									key={key}
									className="browser-panel__ai-toggle"
									title={PERM_TITLES[key]}
								>
									<input
										type="checkbox"
										className="browser-panel__ai-switch"
										checked={toolPerms[key]}
										onChange={(e) => setOne(key, e.target.checked)}
									/>
									<span className="browser-panel__ai-toggle-label">
										{PERM_LABELS[key]}
									</span>
								</label>
							))}

							<span className="browser-panel__ai-sep" />

							{/* Chrome browser-level permissions */}
							<label className="browser-panel__ai-toggle" title="마이크 접근 허용 (모든 사이트)">
								<input
									type="checkbox"
									className="browser-panel__ai-switch"
									checked={chromePerms.mic}
									onChange={(e) => setChromePermToggle("mic", e.target.checked)}
								/>
								<span className="browser-panel__ai-toggle-label">마이크</span>
							</label>
							<label className="browser-panel__ai-toggle" title="카메라 접근 허용 (모든 사이트)">
								<input
									type="checkbox"
									className="browser-panel__ai-switch"
									checked={chromePerms.camera}
									onChange={(e) => setChromePermToggle("camera", e.target.checked)}
								/>
								<span className="browser-panel__ai-toggle-label">카메라</span>
							</label>
							<label className="browser-panel__ai-toggle" title="알림 허용 (모든 사이트)">
								<input
									type="checkbox"
									className="browser-panel__ai-switch"
									checked={chromePerms.notifications}
									onChange={(e) => setChromePermToggle("notifications", e.target.checked)}
								/>
								<span className="browser-panel__ai-toggle-label">알림</span>
							</label>

							{/* Collapse button */}
							<button
								type="button"
								className="browser-panel__ai-collapse"
								title="AI 도구 설정 접기"
								onClick={toggleToolbar}
							>
								▼
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
