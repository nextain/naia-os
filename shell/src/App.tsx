import { useEffect, useState } from "react";
import { SettingsModal } from "./components/SettingsModal";
import { SidePanel } from "./components/SidePanel";
import { TitleBar } from "./components/TitleBar";
import { type ThemeId, hasApiKey, loadConfig } from "./lib/config";

function applyTheme(theme: ThemeId) {
	document.documentElement.setAttribute("data-theme", theme);
}

export function App() {
	const [showSettings, setShowSettings] = useState(!hasApiKey());

	useEffect(() => {
		const config = loadConfig();
		applyTheme(config?.theme ?? "espresso");
	}, [showSettings]); // re-apply when settings close (may have changed)

	return (
		<div className="app-root">
			<TitleBar />
			<div className="app-layout">
				<SidePanel onOpenSettings={() => setShowSettings(true)} />
				<div className="main-area">
					{/* Phase 3+: browser, games, windows */}
				</div>
			</div>

			{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
		</div>
	);
}
