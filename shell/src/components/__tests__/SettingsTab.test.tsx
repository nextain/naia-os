import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-store", () => {
	const store = {
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
	};
	return { load: vi.fn().mockResolvedValue(store) };
});

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
	convertFileSrc: vi.fn((path: string) => `file://${path}`),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn().mockResolvedValue(undefined),
}));

import { directToolCall } from "../../lib/chat-service";
vi.mock("../../lib/chat-service", () => ({
	directToolCall: vi.fn().mockResolvedValue({ success: false }),
}));

// Register providers before importing SettingsTab (mirrors main.tsx)
import "../../lib/providers/llm";
import "../../lib/providers/tts";
import "../../lib/providers/stt";

import { SettingsTab } from "../SettingsTab";

describe("SettingsTab", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("renders dynamic models with pricing info", async () => {
		mockInvoke.mockResolvedValue([]);
		(directToolCall as any).mockResolvedValueOnce({
			success: true,
			output: JSON.stringify({
				models: [
					{
						id: "test-model-1",
						name: "Test Model",
						provider: "gemini",
						price: { input: 1.5, output: 2.5 },
					},
				],
			}),
		});
		render(<SettingsTab />);

		await vi.waitFor(() => {
			expect(screen.getByText("Test Model ($1.5 / $2.5)")).toBeDefined();
		});
	});

	it("accepts gateway model payload as plain array", async () => {
		mockInvoke.mockResolvedValue([]);
		(directToolCall as any).mockResolvedValueOnce({
			success: true,
			output: JSON.stringify([
				{
					id: "gemini/gemini-ultra-test",
					name: "Gemini Ultra Test",
				},
			]),
		});
		render(<SettingsTab />);

		await vi.waitFor(() => {
			expect(screen.getByText("Gemini Ultra Test")).toBeDefined();
		});
	});

	it("renders provider select and API key input", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const providerSelect = document.getElementById("provider-select");
		expect(providerSelect).toBeDefined();
		expect(screen.getByLabelText(/^API/i)).toBeDefined();
	});

	it("replaces API key input with Naia account UI", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const providerSelect = document.getElementById(
			"provider-select",
		) as HTMLSelectElement;
		fireEvent.change(providerSelect, { target: { value: "nextain" } });
		expect(screen.queryByLabelText(/^API/i)).toBeNull();
		expect(
			screen.getByText("Naia 계정 로그인으로 API 키 없이 사용할 수 있습니다."),
		).toBeDefined();
	});

	it("shows live provider selector with default edge-tts", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		// Live provider selector is always visible
		const liveSelect = document.getElementById("live-provider-select") as HTMLSelectElement;
		expect(liveSelect).toBeDefined();
		// Default is edge-tts for non-logged-in users
		expect(liveSelect.value).toBe("edge-tts");
	});

	it("hides API key input for Claude Code CLI provider", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const providerSelect = document.getElementById(
			"provider-select",
		) as HTMLSelectElement;
		fireEvent.change(providerSelect, { target: { value: "claude-code-cli" } });
		expect(screen.queryByLabelText(/^API/i)).toBeNull();
		expect(
			screen.getByText(
				"Claude Code CLI provider는 로컬 CLI 로그인 세션을 사용합니다.",
			),
		).toBeDefined();
	});

	it("renders VRM model picker with sample cards", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByAltText("Shino")).toBeDefined();
		expect(screen.getByAltText("Sakurada Fumiriya")).toBeDefined();
		expect(screen.getByAltText("Girl")).toBeDefined();
		expect(screen.getByAltText("Boy")).toBeDefined();
	});

	it("renders background image picker with none option", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByText(/기본 그라데이션|Default Gradient/i)).toBeDefined();
		expect(screen.getByText("Space")).toBeDefined();
	});

	it("renders VRM custom file button", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByText(/커스텀|Custom/i)).toBeDefined();
	});

	it("selects VRM card and marks as active", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		const avatarCard = screen.getByTitle("Girl");
		fireEvent.click(avatarCard);
		expect(avatarCard.className).toContain("active");
	});

	it("renders memory section with empty state", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByText(/기억|Memory/i)).toBeDefined();
		expect(screen.getByText(/저장된 기억이|No stored memories/i)).toBeDefined();
	});

	it("renders facts when available", async () => {
		mockInvoke.mockResolvedValue([
			{
				id: "f1",
				key: "favorite_lang",
				value: "Rust",
				source_session: null,
				created_at: 1000,
				updated_at: 1000,
			},
		]);
		render(<SettingsTab />);

		await vi.waitFor(() => {
			expect(screen.getByText("favorite_lang")).toBeDefined();
			expect(screen.getByText("Rust")).toBeDefined();
		});
	});

	it("saves config with VRM model", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		// Set API key
		const apiInput = screen.getByLabelText(/^API/i);
		fireEvent.change(apiInput, { target: { value: "test-key" } });

		// Select non-default VRM
		const avatarCard = screen.getByTitle("Girl");
		fireEvent.click(avatarCard);

		// Save
		fireEvent.click(screen.getByText(/save|저장/i));

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.apiKey).toBe("test-key");
		expect(saved.vrmModel).toBe("/avatars/03-OL_Woman.vrm");
	});

	it("renders theme picker", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		expect(screen.getByTitle("Light")).toBeDefined();
		expect(screen.getByTitle("Dark")).toBeDefined();
	});

	it("shows error for empty API key", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);
		fireEvent.click(screen.getByText(/save|저장/i));
		expect(screen.getByText(/입력해주세요|enter.*api/i)).toBeDefined();
	});

	it("saves new provider selection to localStorage", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;

		// Select anthropic (API key required)
		fireEvent.change(providerSelect, { target: { value: "anthropic" } });
		expect(providerSelect.value).toBe("anthropic");

		// Enter API key and save
		const apiInput = screen.getByLabelText(/^API/i);
		fireEvent.change(apiInput, { target: { value: "sk-ant-test-key" } });
		fireEvent.click(screen.getByText(/save|저장/i));

		const saved = JSON.parse(localStorage.getItem("naia-config") || "{}");
		expect(saved.provider).toBe("anthropic");
		expect(saved.apiKey).toBe("sk-ant-test-key");
	});

	it("saves provider with requiresApiKey=false without API key", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;

		// Select ollama (no API key required)
		fireEvent.change(providerSelect, { target: { value: "ollama" } });
		expect(providerSelect.value).toBe("ollama");

		// Save without API key — should NOT show error
		fireEvent.click(screen.getByText(/save|저장/i));
		expect(screen.queryByText(/입력해주세요|enter.*api/i)).toBeNull();
	});

	it("shows error when saving API-required provider without key", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;

		// Select xai (requires API key)
		fireEvent.change(providerSelect, { target: { value: "xai" } });

		// Save without entering key
		fireEvent.click(screen.getByText(/save|저장/i));
		expect(screen.getByText(/입력해주세요|enter.*api/i)).toBeDefined();
	});

	it("all new providers appear as selectable options", () => {
		mockInvoke.mockResolvedValue([]);
		render(<SettingsTab />);

		const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
		const optionValues = Array.from(providerSelect.options).map(o => o.value);

		// Core providers
		expect(optionValues).toContain("nextain");
		expect(optionValues).toContain("gemini");
		expect(optionValues).toContain("openai");
		expect(optionValues).toContain("anthropic");

		// All 8 registered providers
		expect(optionValues).toContain("claude-code-cli");
		expect(optionValues).toContain("xai");
		expect(optionValues).toContain("zai");
		expect(optionValues).toContain("ollama");
		expect(optionValues.length).toBe(8);
	});
});
