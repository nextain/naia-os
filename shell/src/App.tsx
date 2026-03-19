import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarCanvas } from "./components/AvatarCanvas";
import { ChatPanel } from "./components/ChatPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TitleBar } from "./components/TitleBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { syncLinkedChannels } from "./lib/channel-sync";
import {
	type ThemeId,
	isOnboardingComplete,
	loadConfig,
	migrateLabKeyToNaiaKey,
	migrateLiveProviderToUnifiedModel,
	migrateSpeechStyleValues,
	saveConfig,
} from "./lib/config";
import { persistDiscordDefaults } from "./lib/discord-auth";
import { NoopContextBridge } from "./lib/panel-registry";
import { type UpdateInfo, checkForUpdate } from "./lib/updater";
import { BrowserCenterPanel } from "./panels/browser/BrowserCenterPanel";

const noopBridge = new NoopContextBridge();

const LEFT_WIDTH_KEY = "naia:leftWidth";
const LEFT_MIN = 180;
const LEFT_MAX = 520;

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [panelVisible, setPanelVisible] = useState(true);
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
	const [leftWidth, setLeftWidth] = useState(
		() => Number(localStorage.getItem(LEFT_WIDTH_KEY)) || 300,
	);

	const layoutRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// One-time migrations (idempotent)
		void migrateLabKeyToNaiaKey();
		migrateSpeechStyleValues();
		migrateLiveProviderToUnifiedModel();

		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
		if (config?.panelVisible === false) setPanelVisible(false);
		if (!isOnboardingComplete()) {
			setShowOnboarding(true);
		}

		// Request microphone permission early so enumerateDevices returns labeled devices
		navigator.mediaDevices
			?.getUserMedia({ audio: true })
			.then((stream) => {
				for (const track of stream.getTracks()) track.stop();
			})
			.catch(() => {}); // Permission denied is fine — devices will still list without labels
	}, []);

	// Check for updates after onboarding is complete
	useEffect(() => {
		if (showOnboarding) return;
		checkForUpdate()
			.then((info) => {
				if (info) setUpdateInfo(info);
			})
			.catch(() => {
				/* updater not available (Flatpak) or network error */
			});
	}, [showOnboarding]);

	const togglePanel = useCallback(() => {
		setPanelVisible((prev) => {
			const next = !prev;
			const config = loadConfig();
			if (config) saveConfig({ ...config, panelVisible: next });
			return next;
		});
	}, []);

	// Ctrl+B: toggle left panel (Naia avatar + chat)
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "b") {
				e.preventDefault();
				togglePanel();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [togglePanel]);

	// Drag handler: left column resize (drag right edge of app-left)
	const onResizeLeft = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			document.body.classList.add("resizing-col");
			const startX = e.clientX;
			const startW = leftWidth;
			const onMove = (ev: PointerEvent) => {
				const w = Math.max(
					LEFT_MIN,
					Math.min(LEFT_MAX, startW + ev.clientX - startX),
				);
				setLeftWidth(w);
			};
			const onUp = () => {
				document.body.classList.remove("resizing-col");
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				setLeftWidth((cur) => {
					localStorage.setItem(LEFT_WIDTH_KEY, String(cur));
					return cur;
				});
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[leftWidth],
	);

	// Global deep-link sink
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

	// After Lab login, sync linked channels
	useEffect(() => {
		const unlisten = listen("naia_auth_complete", () => {
			void syncLinkedChannels();
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

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
			{/* 2-column layout: [avatar+chat] [browser] */}
			<div className="app-main" ref={layoutRef}>
				{/* Left column: avatar always visible; chat toggles with Ctrl+B */}
				<div className="app-left" style={{ width: leftWidth }}>
					<div className="app-avatar">
						<AvatarCanvas />
					</div>
					{panelVisible && (
						<div className="app-chat">
							<ChatPanel />
						</div>
					)}
				</div>
				<div className="col-resize-handle" onPointerDown={onResizeLeft} />

				{/* Right area: tab bar + browser */}
				<div className="app-right-area">
					<div className="content-tabs">
						<button type="button" className="content-tab content-tab--active">
							브라우저
						</button>
						<button
							type="button"
							className="content-tab content-tab--add"
							disabled
						>
							+
						</button>
					</div>
					<div className="app-right-content">
						<div className="app-browser">
							<BrowserCenterPanel naia={noopBridge} />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
