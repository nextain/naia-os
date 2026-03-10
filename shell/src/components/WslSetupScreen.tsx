import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";

interface WslSetupScreenProps {
	onComplete: () => void;
}

/**
 * Pre-onboarding screen for Windows users.
 * Guides WSL + NaiaEnv setup before the main onboarding wizard.
 * Users can skip to run in Tier 1 (standalone) mode.
 */
export function WslSetupScreen({ onComplete }: WslSetupScreenProps) {
	const [running, setRunning] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleSetup = async () => {
		setRunning(true);
		setError(null);
		setStatus(t("settings.wslSetupRunning"));
		try {
			await invoke("setup_wsl");
			setStatus(null);
			onComplete();
		} catch (err) {
			const msg = String(err);
			Logger.warn("wsl-setup", "WSL setup failed", { error: msg });
			if (msg.includes("restart") || msg.includes("reboot")) {
				setError(t("settings.wslNeedsReboot"));
			} else if (msg.includes("rootfs not found") || msg.includes("NaiaEnv rootfs")) {
				setError(msg);
			} else {
				setError(msg);
			}
			setRunning(false);
		}
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
				{status && !error && <p className="wsl-setup-status">{status}</p>}

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
