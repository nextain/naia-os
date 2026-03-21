import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { PanelContext } from "../lib/panel-registry";

interface PanelState {
	/** Currently active panel id. null = default avatar view. */
	activePanel: string | null;
	setActivePanel: (id: string | null) => void;
	/** Latest context pushed by the active panel (for Naia's system prompt). */
	activePanelContext: PanelContext | null;
	setActivePanelContext: (ctx: PanelContext | null) => void;
	/**
	 * Incremented whenever panels are installed or removed at runtime.
	 * ModeBar and other consumers subscribe to rebuild their panel list.
	 */
	panelListVersion: number;
	bumpPanelListVersion: () => void;
}

export const usePanelStore = create<PanelState>((set, get) => ({
	activePanel: "browser",
	setActivePanel: (id) => {
		const current = get().activePanel;
		if (current === "browser" && id !== "browser") {
			invoke("browser_embed_hide").catch(() => {});
		} else if (id === "browser" && current !== "browser") {
			invoke("browser_embed_show").catch(() => {});
		}
		set({ activePanel: id, activePanelContext: null });
	},
	activePanelContext: null,
	setActivePanelContext: (ctx) => set({ activePanelContext: ctx }),
	panelListVersion: 0,
	bumpPanelListVersion: () =>
		set((s) => ({ panelListVersion: s.panelListVersion + 1 })),
}));
