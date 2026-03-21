// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	NaiaContextBridge,
	PanelContext,
	ToolHandler,
} from "../../lib/panel-registry";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../../lib/logger", () => ({
	Logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../../lib/config", () => ({
	loadConfig: vi.fn().mockReturnValue(null),
	saveConfig: vi.fn(),
}));

// ─── Mock CodeMirror (not available in jsdom) ─────────────────────────────────

vi.mock("@codemirror/view", () => ({
	EditorView: class {
		constructor() {}
		destroy() {}
		state = { doc: { toString: () => "" } };
		dispatch() {}
		static lineWrapping = {};
		static updateListener = { of: () => ({}) };
	},
	keymap: { of: () => ({}) },
	lineNumbers: () => ({}),
}));

vi.mock("@codemirror/state", () => ({
	EditorState: {
		create: () => ({}),
		readOnly: { of: () => ({}) },
	},
}));

vi.mock("@codemirror/commands", () => ({
	defaultKeymap: [],
	history: () => ({}),
	historyKeymap: [],
}));

vi.mock("@codemirror/lang-javascript", () => ({
	javascript: () => ({}),
}));

vi.mock("@codemirror/lang-markdown", () => ({
	markdown: () => ({}),
}));

vi.mock("@codemirror/theme-one-dark", () => ({
	oneDark: {},
}));

vi.mock("react-markdown", () => ({
	default: ({ children }: { children: string }) => <div data-testid="md-preview">{children}</div>,
}));

// ─── Mock NaiaContextBridge ──────────────────────────────────────────────────

class MockBridge implements NaiaContextBridge {
	public contexts: PanelContext[] = [];
	private handlers = new Map<string, ToolHandler>();

	pushContext(ctx: PanelContext): void {
		this.contexts.push(ctx);
	}

	onToolCall(toolName: string, handler: ToolHandler): () => void {
		this.handlers.set(toolName, handler);
		return () => {
			this.handlers.delete(toolName);
		};
	}

	async callTool(
		toolName: string,
		args: Record<string, unknown>,
	): Promise<string> {
		const handler = this.handlers.get(toolName);
		if (!handler) return `No handler: ${toolName}`;
		const result = await handler(args);
		return result ?? "ok";
	}

	hasHandler(toolName: string): boolean {
		return this.handlers.has(toolName);
	}
}

// ─── Tests: WorkspaceCenterPanel ──────────────────────────────────────────────

describe("WorkspaceCenterPanel", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders left FileTree and right area", async () => {
		const { WorkspaceCenterPanel } = await import(
			"../workspace/WorkspaceCenterPanel"
		);
		const bridge = new MockBridge();

		render(<WorkspaceCenterPanel naia={bridge} />);

		// Tree header should be visible
		expect(screen.getByText("탐색기")).toBeDefined();
	});

	it("registers skill_workspace_get_sessions handler on mount", async () => {
		const { WorkspaceCenterPanel } = await import(
			"../workspace/WorkspaceCenterPanel"
		);
		const bridge = new MockBridge();

		render(<WorkspaceCenterPanel naia={bridge} />);

		await waitFor(() => {
			expect(bridge.hasHandler("skill_workspace_get_sessions")).toBe(true);
		});
	});

	it("registers skill_workspace_open_file handler on mount", async () => {
		const { WorkspaceCenterPanel } = await import(
			"../workspace/WorkspaceCenterPanel"
		);
		const bridge = new MockBridge();

		render(<WorkspaceCenterPanel naia={bridge} />);

		await waitFor(() => {
			expect(bridge.hasHandler("skill_workspace_open_file")).toBe(true);
		});
	});

	it("registers skill_workspace_classify_dirs handler on mount", async () => {
		const { WorkspaceCenterPanel } = await import(
			"../workspace/WorkspaceCenterPanel"
		);
		const bridge = new MockBridge();

		render(<WorkspaceCenterPanel naia={bridge} />);

		await waitFor(() => {
			expect(bridge.hasHandler("skill_workspace_classify_dirs")).toBe(true);
		});
	});

	it("skill_workspace_get_sessions returns JSON session list", async () => {
		const { WorkspaceCenterPanel } = await import(
			"../workspace/WorkspaceCenterPanel"
		);
		const bridge = new MockBridge();

		render(<WorkspaceCenterPanel naia={bridge} />);

		await waitFor(() => expect(bridge.hasHandler("skill_workspace_get_sessions")).toBe(true));

		const result = await bridge.callTool("skill_workspace_get_sessions", {});
		// Returns JSON array (empty initially because invoke is mocked to return [])
		const parsed = JSON.parse(result);
		expect(Array.isArray(parsed)).toBe(true);
	});

	it("skill_workspace_open_file updates editor filepath", async () => {
		const { WorkspaceCenterPanel } = await import(
			"../workspace/WorkspaceCenterPanel"
		);
		const bridge = new MockBridge();

		render(<WorkspaceCenterPanel naia={bridge} />);

		await waitFor(() => expect(bridge.hasHandler("skill_workspace_open_file")).toBe(true));

		// Open a file via tool
		const result = await bridge.callTool("skill_workspace_open_file", {
			path: "/var/home/luke/dev/naia-os/AGENTS.md",
		});
		expect(result).toContain("Opened");
		expect(result).toContain("AGENTS.md");
	});
});

// ─── Tests: SessionCard ──────────────────────────────────────────────────────

describe("SessionCard", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders active session with green emoji and dir name", async () => {
		const { SessionCard } = await import("../workspace/SessionCard");

		render(
			<SessionCard
				session={{
					dir: "naia-os-issue-79",
					path: "/var/home/luke/dev/naia-os-issue-79",
					status: "active",
					branch: "issue-79-qwen3-asr",
					progress: { issue: "#79", phase: "build" },
					recent_file: "shell/src/lib/stt/registry.ts",
					last_change: Math.floor(Date.now() / 1000) - 5,
				}}
				onClick={() => {}}
			/>,
		);

		expect(screen.getByText("🟢")).toBeDefined();
		expect(screen.getByText("naia-os-issue-79")).toBeDefined();
	});

	it("renders idle session with yellow emoji", async () => {
		const { SessionCard } = await import("../workspace/SessionCard");

		render(
			<SessionCard
				session={{
					dir: "naia.nextain.io",
					path: "/var/home/luke/dev/naia.nextain.io",
					status: "idle",
					branch: "main",
					progress: { issue: "#8", phase: "e2e" },
					last_change: Math.floor(Date.now() / 1000) - 120,
				}}
				onClick={() => {}}
			/>,
		);

		expect(screen.getByText("🟡")).toBeDefined();
		expect(screen.getByText("naia.nextain.io")).toBeDefined();
	});

	it("renders stopped session with black emoji", async () => {
		const { SessionCard } = await import("../workspace/SessionCard");

		render(
			<SessionCard
				session={{
					dir: "vllm",
					path: "/var/home/luke/dev/vllm",
					status: "stopped",
				}}
				onClick={() => {}}
			/>,
		);

		expect(screen.getByText("⚫")).toBeDefined();
		expect(screen.getByText("vllm")).toBeDefined();
	});

	it("shows progress issue and phase in badge", async () => {
		const { SessionCard } = await import("../workspace/SessionCard");

		render(
			<SessionCard
				session={{
					dir: "naia-os-issue-79",
					path: "/var/home/luke/dev/naia-os-issue-79",
					status: "active",
					progress: { issue: "#79", phase: "build" },
				}}
				onClick={() => {}}
			/>,
		);

		// "#79 · build" should appear (phase from progress.json is lowercase)
		expect(screen.getByText("#79 · build")).toBeDefined();
	});

	it("calls onClick when card is clicked", async () => {
		const { SessionCard } = await import("../workspace/SessionCard");
		const onClick = vi.fn();

		render(
			<SessionCard
				session={{
					dir: "naia-os",
					path: "/var/home/luke/dev/naia-os",
					status: "active",
				}}
				onClick={onClick}
			/>,
		);

		const card = screen.getByRole("button", { name: /naia-os/ });
		fireEvent.click(card);
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});

// ─── Tests: Editor ───────────────────────────────────────────────────────────

describe("Editor", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders empty hint when no file is selected", async () => {
		const { Editor } = await import("../workspace/Editor");

		render(<Editor filePath="" />);

		expect(screen.getByText(/파일 탐색기에서 파일을 선택/)).toBeDefined();
	});

	it("shows filename in header when file is opened", async () => {
		const { invoke } = await import("@tauri-apps/api/core");
		vi.mocked(invoke).mockResolvedValueOnce("file content here");

		const { Editor } = await import("../workspace/Editor");

		render(<Editor filePath="/var/home/luke/dev/naia-os/AGENTS.md" />);

		expect(screen.getByText("AGENTS.md")).toBeDefined();
	});

	it("shows badge when provided", async () => {
		const { invoke } = await import("@tauri-apps/api/core");
		vi.mocked(invoke).mockResolvedValueOnce("content");

		const { Editor } = await import("../workspace/Editor");

		render(
			<Editor
				filePath="/var/home/luke/dev/naia-os/AGENTS.md"
				badge="#79 · Build"
			/>,
		);

		expect(screen.getByText("#79 · Build")).toBeDefined();
	});

	it("shows preview toggle button for markdown files", async () => {
		const { invoke } = await import("@tauri-apps/api/core");
		vi.mocked(invoke).mockResolvedValueOnce("# Heading\n\nContent");

		const { Editor } = await import("../workspace/Editor");

		render(
			<Editor filePath="/var/home/luke/dev/naia-os/docs/design/workspace-panel.ko.md" />,
		);

		expect(screen.getByText("미리보기")).toBeDefined();
	});

	it("shows read-only label for ref- directories", async () => {
		const { invoke } = await import("@tauri-apps/api/core");
		vi.mocked(invoke).mockResolvedValueOnce("readonly content");

		const { Editor } = await import("../workspace/Editor");

		render(
			<Editor
				filePath="/var/home/luke/dev/ref-cline/README.md"
				readOnly={true}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("읽기 전용")).toBeDefined();
		});
	});
});

// ─── Tests: Panel Registry ─────────────────────────────────────────────────

describe("Workspace panel registry", () => {
	beforeEach(async () => {
		// Import index to trigger registration
		await import("../workspace/index");
	});

	it("registers workspace panel as builtIn", async () => {
		const { panelRegistry } = await import("../../lib/panel-registry");
		const panel = panelRegistry.get("workspace");

		expect(panel).toBeDefined();
		expect(panel?.builtIn).toBe(true);
		expect(panel?.id).toBe("workspace");
	});

	it("workspace panel has skill_workspace_get_sessions tool", async () => {
		const { panelRegistry } = await import("../../lib/panel-registry");
		const panel = panelRegistry.get("workspace");

		const tool = panel?.tools?.find(
			(t) => t.name === "skill_workspace_get_sessions",
		);
		expect(tool).toBeDefined();
		expect(tool?.tier).toBe(0);
	});

	it("workspace panel has skill_workspace_open_file tool", async () => {
		const { panelRegistry } = await import("../../lib/panel-registry");
		const panel = panelRegistry.get("workspace");

		const tool = panel?.tools?.find(
			(t) => t.name === "skill_workspace_open_file",
		);
		expect(tool).toBeDefined();
		expect(tool?.tier).toBe(1);
	});

	it("workspace panel has onActivate and onDeactivate hooks", async () => {
		const { panelRegistry } = await import("../../lib/panel-registry");
		const panel = panelRegistry.get("workspace");

		expect(typeof panel?.onActivate).toBe("function");
		expect(typeof panel?.onDeactivate).toBe("function");
	});
});
