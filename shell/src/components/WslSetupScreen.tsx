import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";

interface WslSetupScreenProps {
	onComplete: () => void;
}

/** Step labels shown during WSL setup progress. */
const STEP_LABELS: Record<string, string> = {
	wsl: "Installing WSL...",
	ubuntu: "Installing Ubuntu 24.04...",
	export: "Exporting Ubuntu base...",
	import: "Creating NaiaEnv distro...",
	provision: "Installing components...",
};

/**
 * Pre-onboarding screen for Windows users.
 * Guides WSL + NaiaEnv setup before the main onboarding wizard.
 * Users can skip to run in Tier 1 (standalone) mode.
 */
export function WslSetupScreen({ onComplete }: WslSetupScreenProps) {
	const [running, setRunning] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [detail, setDetail] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Listen for progress events from Rust backend
	useEffect(() => {
		const unlisten = listen<{ step: string; detail: string }>(
			"wsl-setup-progress",
			(event) => {
				const { step, detail: d } = event.payload;
				setStatus(STEP_LABELS[step] ?? step);
				setDetail(d);
			},
		);
		return () => {
			unlisten.then((f) => f());
		};
	}, []);

	// Elapsed time counter while running
	useEffect(() => {
		if (running) {
			setElapsed(0);
			timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
		} else if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [running]);

	const handleSetup = async () => {
		setRunning(true);
		setError(null);
		setStatus(t("settings.wslSetupRunning"));
		setDetail(null);
		try {
			await invoke("setup_wsl");
			setStatus(null);
			setDetail(null);
			onComplete();
		} catch (err) {
			const msg = String(err);
			Logger.warn("wsl-setup", "WSL setup failed", { error: msg });
			if (msg.includes("restart") || msg.includes("reboot")) {
				setError(t("settings.wslNeedsReboot"));
			} else {
				setError(msg);
			}
			setRunning(false);
		}
	};

	const formatElapsed = (s: number) => {
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
	};

	return (
		<div className="wsl-setup-screen">
			<div className="wsl-setup-card">
				<h1>Naia</h1>
				<p className="wsl-setup-desc">
					{t("settings.platformTier2")}
				</p>

				<div className="wsl-setup-tiers">
					<div className="wsl-tier-box">
						<strong>Tier 2</strong>
						<span>{t("settings.wslHintInstall")}</span>
					</div>
					<div className="wsl-tier-box tier-1">
						<strong>Tier 1</strong>
						<span>{t("settings.platformTier1")}</span>
					</div>
				</div>

				{error && <p className="wsl-setup-error">{error}</p>}
				{!error && status && (
					<div className="wsl-setup-progress">
						<p className="wsl-setup-status">{status}</p>
						{detail && <p className="wsl-setup-detail">{detail}</p>}
						{running && (
							<p className="wsl-setup-elapsed">{formatElapsed(elapsed)}</p>
						)}
					</div>
				)}

				<div className="wsl-setup-actions">
					<button
						className="wsl-setup-btn primary"
						onClick={handleSetup}
						disabled={running}
					>
						{running ? t("settings.wslSetupRunning") : t("settings.wslSetupButton")}
					</button>
				</div>
			</div>
		</div>
	);
}
