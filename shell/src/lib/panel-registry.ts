import type React from "react";

// ─── Context ────────────────────────────────────────────────────────────────

/**
 * Structured context a panel pushes to Naia.
 * Each panel type defines its own payload shape via the `data` field.
 */
export interface PanelContext {
	/** Panel type identifier — matches PanelDescriptor.id */
	type: string;
	/** Panel-specific payload (arbitrary JSON) */
	data: Record<string, unknown>;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

/** A tool Naia can call on the active panel. */
export interface NaiaTool {
	id: string;
	description: string;
}

/** Handler invoked when Naia calls a tool. Returns a result string or void. */
export type ToolHandler = (
	args: Record<string, unknown>,
) => Promise<string | void> | string | void;

// ─── Bridge ─────────────────────────────────────────────────────────────────

/**
 * Narrow bridge between a panel and Naia.
 * Panels interact with Naia only through this interface — never via direct imports.
 */
export interface NaiaContextBridge {
	/** Push updated context to Naia's next message system prompt. */
	pushContext(ctx: PanelContext): void;
	/**
	 * Register a handler for a tool Naia may call.
	 * Returns an unsubscribe function.
	 */
	onToolCall(toolId: string, handler: ToolHandler): () => void;
}

/** No-op bridge used as placeholder until a real bridge is wired. */
export class NoopContextBridge implements NaiaContextBridge {
	pushContext(_ctx: PanelContext): void {
		// not yet wired
	}
	onToolCall(_toolId: string, _handler: ToolHandler): () => void {
		return () => {};
	}
}

// ─── Panel Props ─────────────────────────────────────────────────────────────

export interface PanelCenterProps {
	naia: NaiaContextBridge;
}

export interface PanelMetaProps {
	naia: NaiaContextBridge;
}

// ─── Descriptor ──────────────────────────────────────────────────────────────

/** Full description of a panel. Register via `panelRegistry.register()`. */
export interface PanelDescriptor {
	/** Unique identifier, e.g. "avatar", "browser", "issues" */
	id: string;
	/** Human-readable name shown in PanelSwitcher */
	name: string;
	/** Optional icon (emoji or SVG path string) */
	icon?: string;
	/** Center content component (required) */
	center: React.ComponentType<PanelCenterProps>;
	/** Right meta panel component (optional) */
	meta?: React.ComponentType<PanelMetaProps>;
	/** Tools Naia can call while this panel is active */
	tools?: NaiaTool[];
	/** Current panel context snapshot for Naia */
	getContext?: () => PanelContext;
	/** Called when this panel becomes active */
	onActivate?: () => void;
	/** Called when this panel is deactivated */
	onDeactivate?: () => void;
}

// ─── Registry ────────────────────────────────────────────────────────────────

class PanelRegistryImpl {
	private panels = new Map<string, PanelDescriptor>();

	register(panel: PanelDescriptor): void {
		this.panels.set(panel.id, panel);
	}

	unregister(id: string): void {
		this.panels.delete(id);
	}

	get(id: string): PanelDescriptor | undefined {
		return this.panels.get(id);
	}

	list(): PanelDescriptor[] {
		return Array.from(this.panels.values());
	}
}

/** Module-level singleton. Import and call `.register()` from each panel module. */
export const panelRegistry = new PanelRegistryImpl();
