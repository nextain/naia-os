import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";

interface WslSetupScreenProps {
	onComplete: () => void;
}

/** User-friendly step labels shown during setup progress. */
const STEP_LABELS: Record<string, string> = {
	wsl: "wslProgress.wsl",
	ubuntu: "wslProgress.ubuntu",
	export: "wslProgress.export",
	import: "wslProgress.import",
	provision: "wslProgress.provision",
	provision_node: "wslProgress.provisionNode",
	provision_openclaw: "wslProgress.provisionOpenclaw",
	provision_config: "wslProgress.provisionConfig",
	provision_verify: "wslProgress.provisionVerify",
};

/**
 * Pre-onboarding screen for Windows users.
 * Guides automatic environment setup before the main onboarding wizard.
 */
export function WslSetupScreen({ onComplete }: WslSetupScreenProps) {
	const [running, setRunning] = useState(false);
	const [stepKey, setStepKey] = useState<string | null>(null);
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
				setStepKey(step);
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
		setStepKey(null);
		setDetail(null);
		try {
			await invoke("setup_wsl");
			setStepKey(null);
			setDetail(null);
			onComplete();
		} catch (err) {
			const msg = String(err);
			Logger.warn("wsl-setup", "WSL setup failed", { error: msg });
			if (msg.includes("restart") || msg.includes("reboot")) {
				setError(t("wslSetup.needsReboot"));
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

	const statusLabel = stepKey
		? t(STEP_LABELS[stepKey] as any) || stepKey
		: running
			? t("wslSetup.preparing")
			: null;

	return (
		<div className="wsl-setup-screen">
			<div className="wsl-setup-card">
				<h1>{t("wslSetup.title")}</h1>
				<p className="wsl-setup-desc">
					{t("wslSetup.description")}
				</p>
				<p className="wsl-setup-desc" style={{ fontSize: "0.85em", opacity: 0.7 }}>
					{t("wslSetup.timeEstimate")}
				</p>

				{error && <p className="wsl-setup-error">{error}</p>}
				{!error && statusLabel && (
					<div className="wsl-setup-progress">
						<p className="wsl-setup-status">{statusLabel}</p>
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
						{running ? t("wslSetup.running") : t("wslSetup.startButton")}
					</button>
				</div>
			</div>
		</div>
	);
}
