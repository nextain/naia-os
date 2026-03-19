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

/**
 * A tool Naia (LLM) can call while this panel is active.
 *
 * Serializable descriptor sent to the Agent as a proxy stub.
 * Actual execution happens in the Shell via NaiaContextBridge.onToolCall.
 *
 * name must have "skill_" prefix (e.g. "skill_browse_navigate").
 */
export interface NaiaTool {
	/** Unique skill name with skill_ prefix, e.g. "skill_browse_navigate" */
	name: string;
	description: string;
	/** JSON Schema for parameters */
	parameters?: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
	};
	/** Permission tier (0=auto, 1=notify, 2=confirm, 3=block). Default 1. */
	tier?: number;
}

/** Handler invoked when Naia calls a panel tool. Returns a result string or void. */
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
	 * toolName must match NaiaTool.name (with skill_ prefix).
	 * Returns an unsubscribe function.
	 */
	onToolCall(toolName: string, handler: ToolHandler): () => void;
}

/** No-op bridge used as placeholder until a real bridge is wired. */
export class NoopContextBridge implements NaiaContextBridge {
	pushContext(_ctx: PanelContext): void {
		// not yet wired
	}
	onToolCall(_toolName: string, _handler: ToolHandler): () => void {
		return () => {};
	}
}

/**
 * Real bridge: forwards pushContext → panel store (so Naia's system prompt
 * picks it up), and routes onToolCall registrations for panel tool execution.
 *
 * Panel tools execute in the Shell (WebView). When the Agent receives a
 * panel_tool_call from the LLM, it forwards it here via callTool().
 */
export class ActivePanelBridge implements NaiaContextBridge {
	private handlers = new Map<string, ToolHandler>();

	pushContext(ctx: PanelContext): void {
		// Dynamic import avoids circular dep (stores/panel → panel-registry → stores/panel)
		import("../stores/panel").then(({ usePanelStore }) => {
			usePanelStore.getState().setActivePanelContext(ctx);
		});
	}

	onToolCall(toolName: string, handler: ToolHandler): () => void {
		this.handlers.set(toolName, handler);
		return () => {
			this.handlers.delete(toolName);
		};
	}

	/** Called when Agent forwards a panel_tool_call from the LLM. */
	async callTool(
		toolName: string,
		args: Record<string, unknown>,
	): Promise<string> {
		const handler = this.handlers.get(toolName);
		if (!handler) return `No handler registered for tool: ${toolName}`;
		const result = await handler(args);
		return result ?? "ok";
	}
}

// ─── Panel Props ─────────────────────────────────────────────────────────────

export interface PanelCenterProps {
	naia: NaiaContextBridge;
}

// ─── Descriptor ──────────────────────────────────────────────────────────────

/** Full description of a panel. Register via `panelRegistry.register()`. */
export interface PanelDescriptor {
	/** Unique identifier, e.g. "avatar", "browser", "issues" */
	id: string;
	/** Human-readable name shown in ModeBar */
	name: string;
	/** Localized names (locale → label). Falls back to `name` if locale not found. */
	names?: Record<string, string>;
	/** Optional icon — emoji string (e.g. "📝") */
	icon?: string;
	/** Inline SVG content loaded from the panel's icon file. Takes priority over `icon`. */
	iconSvg?: string;
	/** Absolute path to index.html — if set, panel renders via iframe (asset protocol). */
	htmlEntry?: string;
	/**
	 * Built-in panels (browser, workspace) cannot be deleted by the user.
	 * Installed panels (~/.naia/panels/) should omit this or set false.
	 */
	builtIn?: boolean;
	/**
	 * "installed" — loaded from ~/.naia/panels/ at runtime.
	 * Omit or "code" for panels bundled in the shell's source.
	 * ModeBar uses this to decide whether to also delete from disk on remove.
	 */
	source?: "installed" | "code";
	/** Center component — owns the entire right area layout. */
	center: React.ComponentType<PanelCenterProps>;
	/**
	 * Tools Naia can call while this panel is active.
	 * Sent to the Agent as proxy stubs; handlers registered via NaiaContextBridge.onToolCall.
	 */
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
