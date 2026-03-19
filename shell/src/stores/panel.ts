import { create } from "zustand";

interface PanelState {
	/** Currently active panel id. null = default avatar view. */
	activePanel: string | null;
	setActivePanel: (id: string | null) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
	activePanel: null,
	setActivePanel: (id) => set({ activePanel: id }),
}));
