import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelCenterProps } from "../../lib/panel-registry";

export function BrowserCenterPanel({ naia }: PanelCenterProps) {
	const [inputUrl, setInputUrl] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
	const [installed, setInstalled] = useState<boolean | null>(null);
	const [installProgress, setInstallProgress] = useState("");
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// Check install state
	useEffect(() => {
		invoke<boolean>("browser_check").then(setInstalled);
	}, []);

	// Initial navigate to google.com once installed
	useEffect(() => {
		if (installed !== true) return;
		invoke("browser_navigate", { url: "https://www.google.com" })
			.then(() => refreshPageInfo())
			.catch((e: unknown) => setError(String(e)));
	}, [installed]);

	const refreshPageInfo = useCallback(async () => {
		try {
			const [u, t] = await invoke<[string, string]>("browser_page_info");
			setInputUrl(u);
			if (u) naia.pushContext({ type: "browser", data: { url: u, title: t } });
		} catch {
			// ignore
		}
	}, [naia]);

	const refreshScreenshot = useCallback(async () => {
		try {
			const dataUrl = await invoke<string>("browser_screenshot");
			setScreenshotSrc(dataUrl);
		} catch {
			// ignore silently
		}
	}, []);

	// Poll screenshot while installed
	useEffect(() => {
		if (installed !== true) return;
		// Initial screenshot
		refreshScreenshot();
		pollRef.current = setInterval(() => {
			void refreshScreenshot();
		}, 800);
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [installed, refreshScreenshot]);

	// Listen for install progress events
	useEffect(() => {
		const un = listen<{ stage: string; msg: string }>("browser-install-progress", (e) => {
			setInstallProgress(e.payload.msg);
			if (e.payload.stage === "done") {
				invoke<boolean>("browser_check").then(setInstalled);
				setLoading(false);
				setInstallProgress("");
			}
		});
		return () => {
			un.then((fn) => fn());
		};
	}, []);

	const navigate = useCallback(
		async (target: string) => {
			const normalized =
				target.startsWith("http") || target.startsWith("about:")
					? target
					: `https://${target}`;
			setLoading(true);
			setError("");
			try {
				await invoke("browser_navigate", { url: normalized });
				await refreshPageInfo();
			} catch (e) {
				setError(String(e));
			} finally {
				setLoading(false);
			}
		},
		[refreshPageInfo],
	);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputUrl.trim()) navigate(inputUrl.trim());
	};

	const handleInstall = async () => {
		setLoading(true);
		setError("");
		try {
			await invoke("browser_install");
			// progress events handle the rest
		} catch (e) {
			setError(String(e));
			setLoading(false);
		}
	};

	// Not-installed screen
	if (installed === false) {
		return (
			<div className="browser-panel browser-panel--install">
				<div className="browser-panel__install-box">
					<p className="browser-panel__install-title">agent-browser 미설치</p>
					<p className="browser-panel__install-desc">
						내장 브라우저를 사용하려면 agent-browser를 설치해야 합니다.
					</p>
					{installProgress && (
						<p className="browser-panel__install-progress">{installProgress}</p>
					)}
					{error && <p className="browser-panel__error">{error}</p>}
					<button
						type="button"
						className="browser-panel__install-btn"
						onClick={handleInstall}
						disabled={loading}
					>
						{loading ? "설치 중…" : "설치"}
					</button>
				</div>
			</div>
		);
	}

	// Loading check
	if (installed === null) {
		return (
			<div className="browser-panel">
				<div className="browser-panel__empty">브라우저 확인 중…</div>
			</div>
		);
	}

	return (
		<div className="browser-panel">
			<div className="browser-panel__toolbar">
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => {
						setLoading(true);
						invoke("browser_back")
							.then(() => refreshPageInfo())
							.catch(() => setLoading(false));
					}}
					title="뒤로"
				>
					←
				</button>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => {
						setLoading(true);
						invoke("browser_forward")
							.then(() => refreshPageInfo())
							.catch(() => setLoading(false));
					}}
					title="앞으로"
				>
					→
				</button>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => {
						setLoading(true);
						invoke("browser_reload")
							.then(() => refreshPageInfo())
							.catch(() => setLoading(false));
					}}
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
						disabled={loading}
					/>
				</form>
				<button
					type="button"
					className="browser-panel__nav-btn browser-panel__nav-btn--new-tab"
					onClick={() => invoke("browser_tab_new")}
					title="새 탭"
				>
					＋
				</button>
			</div>

			{/* Screenshot viewport */}
			<div className="browser-panel__viewport">
				{loading && <div className="browser-panel__loading">로딩 중…</div>}
				{error && <div className="browser-panel__error">{error}</div>}
				{screenshotSrc ? (
					<img
						src={screenshotSrc}
						alt="브라우저 화면"
						className="browser-panel__screenshot"
						draggable={false}
					/>
				) : (
					!error && <div className="browser-panel__empty">브라우저 초기화 중…</div>
				)}
			</div>
		</div>
	);
}
