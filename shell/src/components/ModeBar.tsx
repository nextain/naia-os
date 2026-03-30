import { type MouseEvent, useMemo } from "react";
import { loadConfig, saveConfig } from "../lib/config";
import { getLocale } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { removeInstalledPanel } from "../lib/panel-loader";
import { panelRegistry } from "../lib/panel-registry";
import { usePanelStore } from "../stores/panel";

interface ModeBarProps {
	/** Called when user clicks the + button. Hook up panel marketplace or file picker. */
	onAddMode?: () => void;
}

export function ModeBar({ onAddMode }: ModeBarProps) {
	const {
		activePanel,
		setActivePanel,
		panelListVersion,
		bumpPanelListVersion,
	} = usePanelStore();

	// Rebuild panel list whenever panelListVersion changes (runtime install/remove)
	// Exclude avatar panel (shown as fixed "바탕화면" tab separately)
	const modes = useMemo(
		() => panelRegistry.list().filter((p) => p.id !== "avatar"),
		// panelListVersion is the reactive dependency — registry is not observable directly
		[panelListVersion],
	);

	async function handleRemovePanel(
		e: MouseEvent<HTMLButtonElement>,
		panelId: string,
	) {
		e.stopPropagation();
		const descriptor = panelRegistry.get(panelId);
		Logger.info("ModeBar", `Removing panel: ${panelId}`, {
			source: descriptor?.source,
		});

		if (descriptor?.source === "installed") {
			// Unregisters + deletes from disk + bumps panelListVersion
			await removeInstalledPanel(panelId);
		} else {
			// Build-time panel: unregister in memory + persist deletion in config
			panelRegistry.unregister(panelId);
			const cfg = loadConfig();
			if (cfg) {
				const prev = cfg.deletedPanels ?? [];
				if (!prev.includes(panelId)) {
					saveConfig({ ...cfg, deletedPanels: [...prev, panelId] });
				}
			}
			bumpPanelListVersion();
		}

		if (activePanel === panelId) {
			setActivePanel(null);
		}

		Logger.debug("ModeBar", `Panel removed: ${panelId}`);
	}

	return (
		<div className="mode-bar">
			<div className="mode-bar-tabs">
				{modes.map((mode) => (
					<div
						key={mode.id}
						className="mode-bar-tab-wrapper"
						data-panel-id={mode.id}
					>
						<button
							type="button"
							className={`mode-bar-tab${activePanel === mode.id ? " mode-bar-tab--active" : ""}`}
							data-panel-id={mode.id}
							onClick={() =>
								setActivePanel(activePanel === mode.id ? null : mode.id)
							}
						>
							{mode.iconSvg ? (
								<span
									className="mode-bar-tab-icon mode-bar-tab-icon--svg"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted panel SVG
									dangerouslySetInnerHTML={{ __html: mode.iconSvg }}
								/>
							) : mode.icon ? (
								<span className="mode-bar-tab-icon">{mode.icon}</span>
							) : null}
							<span className="mode-bar-tab-name">
								{mode.names?.[getLocale()] ?? mode.name}
							</span>
						</button>
						{!mode.builtIn && (
							<button
								type="button"
								className="mode-bar-tab-remove"
								title={`Remove ${mode.name}`}
								onClick={(e) => handleRemovePanel(e, mode.id)}
							>
								🗑
							</button>
						)}
					</div>
				))}
			</div>
			<button
				type="button"
				className="mode-bar-add"
				onClick={onAddMode}
				title="패널 추가"
			>
				+
			</button>
		</div>
	);
}
