import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { PanelCenterProps } from "../../lib/panel-registry";

type BrowserStatus = "idle" | "loading" | "ready" | "error" | "not-installed";

export function BrowserCenterPanel({ naia }: PanelCenterProps) {
	const [status, setStatus] = useState<BrowserStatus>("idle");
	const [url, setUrl] = useState("");
	const [inputUrl, setInputUrl] = useState("");
	const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState("");

	// Check agent-browser availability on mount
	useEffect(() => {
		invoke<boolean>("browser_check").then((ok) => {
			setStatus(ok ? "idle" : "not-installed");
		});
	}, []);

	const navigate = useCallback(async (target: string) => {
		const normalized = target.startsWith("http") ? target : `https://${target}`;
		setStatus("loading");
		setErrorMsg("");
		try {
			await invoke("browser_navigate", { url: normalized });
			const [currentUrl] = await invoke<[string, string]>("browser_page_info");
			setUrl(currentUrl);
			setInputUrl(currentUrl);
			// Take screenshot after navigation
			const path = await invoke<string>("browser_screenshot");
			setScreenshotSrc(`${convertFileSrc(path)}?t=${Date.now()}`);
			setStatus("ready");
			// Push context to Naia
			naia.pushContext({
				type: "browser",
				data: { url: currentUrl },
			});
		} catch (e) {
			setErrorMsg(String(e));
			setStatus("error");
		}
	}, [naia]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputUrl.trim()) navigate(inputUrl.trim());
	};

	const handleNav = async (cmd: "browser_back" | "browser_forward" | "browser_reload") => {
		setStatus("loading");
		try {
			await invoke(cmd);
			const [currentUrl] = await invoke<[string, string]>("browser_page_info");
			setUrl(currentUrl);
			setInputUrl(currentUrl);
			const path = await invoke<string>("browser_screenshot");
			setScreenshotSrc(`${convertFileSrc(path)}?t=${Date.now()}`);
			setStatus("ready");
			naia.pushContext({ type: "browser", data: { url: currentUrl } });
		} catch (e) {
			setErrorMsg(String(e));
			setStatus("error");
		}
	};

	if (status === "not-installed") {
		return (
			<div className="browser-panel browser-panel--not-installed">
				<p className="browser-panel__title">agent-browser not installed</p>
				<code className="browser-panel__cmd">cargo install agent-browser</code>
				<p className="browser-panel__hint">Restart Naia after installation.</p>
			</div>
		);
	}

	return (
		<div className="browser-panel">
			<div className="browser-panel__toolbar">
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => handleNav("browser_back")}
					title="Back"
					disabled={status === "loading"}
				>
					←
				</button>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => handleNav("browser_forward")}
					title="Forward"
					disabled={status === "loading"}
				>
					→
				</button>
				<button
					type="button"
					className="browser-panel__nav-btn"
					onClick={() => handleNav("browser_reload")}
					title="Reload"
					disabled={status === "loading"}
				>
					↺
				</button>
				<form className="browser-panel__url-form" onSubmit={handleSubmit}>
					<input
						type="text"
						className="browser-panel__url-input"
						value={inputUrl}
						onChange={(e) => setInputUrl(e.target.value)}
						placeholder="Enter URL…"
						disabled={status === "loading"}
					/>
				</form>
			</div>

			<div className="browser-panel__viewport">
				{status === "loading" && (
					<div className="browser-panel__loading">Loading…</div>
				)}
				{status === "error" && (
					<div className="browser-panel__error">{errorMsg}</div>
				)}
				{screenshotSrc && (
					<img
						className="browser-panel__screenshot"
						src={screenshotSrc}
						alt={url}
					/>
				)}
				{status === "idle" && !screenshotSrc && (
					<div className="browser-panel__empty">
						Enter a URL to start browsing
					</div>
				)}
			</div>
		</div>
	);
}
