import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarCanvas } from "./components/AvatarCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TitleBar } from "./components/TitleBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { WslSetupScreen } from "./components/WslSetupScreen";
import {
	type PanelPosition,
	type ThemeId,
	isOnboardingComplete,
	loadConfig,
	migrateLabKeyToNaiaKey,
	migrateLiveProviderToUnifiedModel,
	migrateSpeechStyleValues,
	saveConfig,
} from "./lib/config";
import { restartGateway } from "./lib/openclaw-sync";
import { persistDiscordDefaults } from "./lib/discord-auth";
import { syncLinkedChannels } from "./lib/channel-sync";
import { type UpdateInfo, checkForUpdate } from "./lib/updater";

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	const [showWslSetup, setShowWslSetup] = useState(false);
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [panelPosition, setPanelPosition] = useState<PanelPosition>("bottom");
	const [panelVisible, setPanelVisible] = useState(true);
	const [panelSize, setPanelSize] = useState(70);
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
	const layoutRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// One-time migrations (idempotent)
		void migrateLabKeyToNaiaKey();
		migrateSpeechStyleValues();
		migrateLiveProviderToUnifiedModel();

		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
		if (config?.panelPosition) setPanelPosition(config.panelPosition);
		if (config?.panelVisible === false) setPanelVisible(false);
		if (config?.panelSize)
			setPanelSize(Math.max(15, Math.min(80, config.panelSize)));

		const needsOnboarding = !isOnboardingComplete();

		// Always check platform tier on startup.
		// On Windows Tier 1 (WSL/NaiaEnv missing): show WSL setup screen,
		// even if onboarding was previously completed (install may have been
		// interrupted, or user reinstalled without WSL).
		invoke("get_platform_tier")
			.then((tier) => {
				const info = tier as { platform: string; tier: number };
				if (info.platform === "windows" && info.tier === 1) {
					setShowWslSetup(true);
				} else if (needsOnboarding) {
					setShowOnboarding(true);
				}
			})
			.catch(() => {
				// Non-Windows or invoke failed — show onboarding if needed
				if (needsOnboarding) {
					setShowOnboarding(true);
				}
			});
	}, []);

	// Check for updates after onboarding is complete
	useEffect(() => {
		if (showOnboarding) return;
		checkForUpdate().then((info) => {
			if (info) setUpdateInfo(info);
		}).catch(() => { /* updater not available (Flatpak) or network error */ });
	}, [showOnboarding]);

	// Ctrl+B: toggle panel visibility
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "b") {
				e.preventDefault();
				togglePanel();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const togglePanel = useCallback(() => {
		setPanelVisible((prev) => {
			const next = !prev;
			const config = loadConfig();
			if (config) saveConfig({ ...config, panelVisible: next });
			return next;
		});
	}, []);

	const onResizeStart = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			const rect = layoutRef.current?.getBoundingClientRect();
			if (!rect) return;

			const isBottom = panelPosition === "bottom";
			const isRight = panelPosition === "right";
			document.body.classList.add(isBottom ? "resizing-row" : "resizing-col");

			const onMove = (ev: PointerEvent) => {
				let pct: number;
				if (isBottom) {
					pct = ((rect.bottom - ev.clientY) / rect.height) * 100;
				} else if (isRight) {
					pct = ((rect.right - ev.clientX) / rect.width) * 100;
				} else {
					pct = ((ev.clientX - rect.left) / rect.width) * 100;
				}
				setPanelSize(Math.max(15, Math.min(80, pct)));
			};

			const onUp = () => {
				document.body.classList.remove("resizing-row", "resizing-col");
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				setPanelSize((current) => {
					const cfg = loadConfig();
					if (cfg) saveConfig({ ...cfg, panelSize: current });
					return current;
				});
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[panelPosition],
	);

	// Listen for panel position changes from SettingsTab
	useEffect(() => {
		const handler = (e: Event) => {
			const pos = (e as CustomEvent<PanelPosition>).detail;
			setPanelPosition(pos);
			setPanelSize(loadConfig()?.panelSize ?? 70);
		};
		window.addEventListener("naia:panel-position", handler);
		return () => window.removeEventListener("naia:panel-position", handler);
	}, []);

	// Global deep-link sink: must persist even when Settings/Onboarding is not open.
	useEffect(() => {
		const unlisten = listen<{
			discordUserId?: string | null;
			discordChannelId?: string | null;
			discordTarget?: string | null;
		}>("discord_auth_complete", (event) => {
			persistDiscordDefaults(event.payload);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// After Lab login, sync linked channels (e.g. Discord DM) from gateway
	useEffect(() => {
		const unlisten = listen("naia_auth_complete", () => {
			void syncLinkedChannels();
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	if (showWslSetup) {
		return (
			<div className="app-root">
				<TitleBar panelVisible={panelVisible} onTogglePanel={togglePanel} />
				<WslSetupScreen
					onComplete={() => {
						setShowWslSetup(false);
						// Always start Gateway after WSL setup completes.
						// During initial app startup, Gateway spawn was skipped
						// because NaiaEnv didn't exist yet.
						restartGateway().catch(() => {});
						if (!isOnboardingComplete()) {
							// First install: proceed to onboarding
							setShowOnboarding(true);
						}
					}}
				/>
			</div>
		);
	}

	if (showOnboarding) {
		return (
			<div className="app-root">
				<TitleBar panelVisible={panelVisible} onTogglePanel={togglePanel} />
				<OnboardingWizard onComplete={() => setShowOnboarding(false)} />
			</div>
		);
	}

	return (
		<div className="app-root">
			<TitleBar panelVisible={panelVisible} onTogglePanel={togglePanel} />
			{updateInfo && (
				<UpdateBanner info={updateInfo} onDismiss={() => setUpdateInfo(null)} />
			)}
			<div
				className="app-layout"
				ref={layoutRef}
				data-panel-position={panelPosition}
				style={{ "--panel-size": `${panelSize}%` } as React.CSSProperties}
			>
				{panelVisible && (
					<div className="side-panel">
						<ChatPanel />
					</div>
				)}
				{panelVisible && (
					<div className="resize-handle" onPointerDown={onResizeStart} />
				)}
				<div className="main-area">
					<AvatarCanvas />
				</div>
			</div>
		</div>
	);
}
