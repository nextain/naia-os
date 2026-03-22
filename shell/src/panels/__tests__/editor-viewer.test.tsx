// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
	convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock("../../lib/logger", () => ({
	Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock CodeMirror — not available in jsdom
vi.mock("@codemirror/view", () => {
	class EditorView {
		constructor() {}
		destroy() {}
		state = { doc: { toString: () => "" } };
		dispatch = vi.fn();
		static lineWrapping = {};
		static updateListener = { of: () => ({}) };
	}
	return {
		EditorView,
		keymap: { of: () => ({}) },
		lineNumbers: () => ({}),
	};
});
vi.mock("@codemirror/state", () => ({
	EditorState: { create: () => ({}), readOnly: { of: () => ({}) } },
	Transaction: { addToHistory: { of: () => ({}) } },
}));
vi.mock("@codemirror/commands", () => ({
	defaultKeymap: [],
	history: () => ({}),
	historyKeymap: [],
}));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: {} }));
vi.mock("@codemirror/lang-javascript", () => ({ javascript: () => ({}) }));
vi.mock("@codemirror/lang-markdown", () => ({ markdown: () => ({}) }));
vi.mock("@codemirror/lang-python", () => ({ python: () => ({}) }));
vi.mock("@codemirror/lang-rust", () => ({ rust: () => ({}) }));
vi.mock("@codemirror/lang-yaml", () => ({ yaml: () => ({}) }));
vi.mock("@codemirror/lang-json", () => ({ json: () => ({}) }));
vi.mock("@codemirror/lang-css", () => ({ css: () => ({}) }));

// ─── Subject ──────────────────────────────────────────────────────────────────

import { Editor } from "../workspace/Editor";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

// ─── Helper: file type detection ──────────────────────────────────────────────

describe("Editor — file type helpers (via render behaviour)", () => {
	it("renders image viewer for .png", async () => {
		mockInvoke.mockResolvedValue("");
		render(<Editor filePath="/dev/project/screenshot.png" />);
		// Image viewer shows <img>, not CodeMirror
		await waitFor(() => {
			expect(screen.getByRole("img")).toBeInTheDocument();
		});
		const img = screen.getByRole("img");
		expect(img).toHaveAttribute("src", "asset:///dev/project/screenshot.png");
	});

	it("renders image viewer for .jpg", async () => {
		mockInvoke.mockResolvedValue("");
		render(<Editor filePath="/foo/photo.jpg" />);
		await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
	});

	it("renders image viewer for .webp", async () => {
		mockInvoke.mockResolvedValue("");
		render(<Editor filePath="/foo/banner.webp" />);
		await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
	});

	it("does NOT call workspace_read_file for image files", () => {
		render(<Editor filePath="/foo/image.png" />);
		expect(mockInvoke).not.toHaveBeenCalledWith(
			"workspace_read_file",
			expect.anything(),
		);
	});

	it("renders CSV table viewer for .csv", async () => {
		mockInvoke.mockResolvedValueOnce("name,age,city\nAlice,30,Seoul\nBob,25,Busan");
		render(<Editor filePath="/data/users.csv" />);
		await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
		// Header row
		expect(screen.getByText("name")).toBeInTheDocument();
		expect(screen.getByText("age")).toBeInTheDocument();
		expect(screen.getByText("city")).toBeInTheDocument();
		// Data rows
		expect(screen.getByText("Alice")).toBeInTheDocument();
		expect(screen.getByText("Bob")).toBeInTheDocument();
	});

	it("CSV table is sortable — clicking header sorts ascending then descending", async () => {
		mockInvoke.mockResolvedValueOnce("name,score\nCharlie,80\nAlice,95\nBob,70");
		render(<Editor filePath="/data/scores.csv" />);
		await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

		const nameHeader = screen.getByText("name");
		// Initial order: Charlie, Alice, Bob
		let cells = screen.getAllByRole("cell");
		expect(cells[0].textContent).toBe("Charlie");

		fireEvent.click(nameHeader);
		// After ascending sort by name: Alice, Bob, Charlie
		cells = screen.getAllByRole("cell");
		expect(cells[0].textContent).toBe("Alice");
		expect(screen.getByText("name ▲")).toBeInTheDocument();

		fireEvent.click(nameHeader);
		// After descending sort
		cells = screen.getAllByRole("cell");
		expect(cells[0].textContent).toBe("Charlie");
		expect(screen.getByText("name ▼")).toBeInTheDocument();
	});

	it("shows empty hint for empty CSV", async () => {
		mockInvoke.mockResolvedValueOnce("");
		render(<Editor filePath="/data/empty.csv" />);
		await waitFor(() =>
			expect(screen.getByText("CSV 데이터가 없습니다")).toBeInTheDocument(),
		);
	});

	it("renders log viewer for .log (contains pre element)", async () => {
		mockInvoke.mockResolvedValueOnce("INFO: server started\nERROR: connection refused");
		render(<Editor filePath="/var/log/app.log" />);
		await waitFor(() => {
			const pre = document.querySelector(".workspace-editor__log-pre");
			expect(pre).toBeInTheDocument();
		});
	});

	it("renders log content (ANSI stripped/converted)", async () => {
		mockInvoke.mockResolvedValueOnce("plain log line");
		render(<Editor filePath="/var/log/app.log" />);
		await waitFor(() => {
			const pre = document.querySelector(".workspace-editor__log-pre");
			expect(pre?.textContent).toContain("plain log line");
		});
	});

	it("does NOT show markdown view-mode buttons for image files", async () => {
		mockInvoke.mockResolvedValue("");
		render(<Editor filePath="/img/photo.png" />);
		await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
		expect(screen.queryByText("편집")).not.toBeInTheDocument();
		expect(screen.queryByText("미리보기")).not.toBeInTheDocument();
	});

	it("does NOT show markdown view-mode buttons for CSV files", async () => {
		mockInvoke.mockResolvedValueOnce("a,b\n1,2");
		render(<Editor filePath="/data/file.csv" />);
		await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
		expect(screen.queryByText("편집")).not.toBeInTheDocument();
	});

	it("shows file name in header for all viewer types", async () => {
		mockInvoke.mockResolvedValue("");
		render(<Editor filePath="/some/dir/photo.png" />);
		await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
		expect(screen.getByText("photo.png")).toBeInTheDocument();
	});

	it("resets sort when file changes", async () => {
		mockInvoke
			.mockResolvedValueOnce("name,val\nZeta,1\nAlpha,2")
			.mockResolvedValueOnce("col1,col2\nX,Y");
		const { rerender } = render(<Editor filePath="/data/a.csv" />);
		await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

		// Sort by name
		fireEvent.click(screen.getByText("name"));
		expect(screen.getByText("name ▲")).toBeInTheDocument();

		// Switch file → sort should reset
		rerender(<Editor filePath="/data/b.csv" />);
		await waitFor(() => expect(screen.getByText("col1")).toBeInTheDocument());
		// No sort indicator
		expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
	});

	it("shows load error for failed file read", async () => {
		mockInvoke.mockRejectedValueOnce(new Error("permission denied"));
		render(<Editor filePath="/root/secret.csv" />);
		await waitFor(() =>
			expect(screen.getByText(/파일을 열 수 없습니다/)).toBeInTheDocument(),
		);
	});
});
