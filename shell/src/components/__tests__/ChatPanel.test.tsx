import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentResponseChunk } from "../../lib/types";
import { useAvatarStore } from "../../stores/avatar";
import { useChatStore } from "../../stores/chat";
import { ChatPanel } from "../ChatPanel";

// Mock chat-service — capture onChunk callback
let capturedOnChunk: ((chunk: AgentResponseChunk) => void) | null = null;
vi.mock("../../lib/chat-service", () => ({
	sendChatMessage: vi
		.fn()
		.mockImplementation(
			(opts: { onChunk: (chunk: AgentResponseChunk) => void }) => {
				capturedOnChunk = opts.onChunk;
				return Promise.resolve();
			},
		),
	cancelChat: vi.fn().mockResolvedValue(undefined),
}));

// Mock Tauri APIs (needed by chat-service)
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("ChatPanel", () => {
	afterEach(() => {
		cleanup();
		capturedOnChunk = null;
		useChatStore.setState(useChatStore.getInitialState());
		useAvatarStore.setState(useAvatarStore.getInitialState());
	});

	it("renders input field and buttons", () => {
		render(<ChatPanel />);
		expect(screen.getByPlaceholderText(/메시지|message/i)).toBeDefined();
		const buttons = screen.getAllByRole("button");
		expect(buttons.length).toBeGreaterThanOrEqual(2);
	});

	it("does not send empty message", () => {
		render(<ChatPanel />);
		// Send button is the last button in the input bar
		const buttons = screen.getAllByRole("button");
		const sendBtn = buttons.find((b) => b.textContent === "↑")!;
		fireEvent.click(sendBtn);
		// No messages should be added
		expect(useChatStore.getState().messages).toHaveLength(0);
	});

	it("sends message on Enter", async () => {
		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "안녕" } });
		fireEvent.keyDown(input, { key: "Enter" });

		// Wait for async state updates
		await new Promise((r) => setTimeout(r, 50));

		// User message + assistant error message (no API key)
		const { messages } = useChatStore.getState();
		expect(messages.length).toBeGreaterThanOrEqual(1);
		expect(messages[0].content).toBe("안녕");
		expect(messages[0].role).toBe("user");
	});

	it("displays session cost header", () => {
		useChatStore.setState({ totalSessionCost: 0.005 });
		render(<ChatPanel />);
		expect(screen.getByText(/\$0\.005/)).toBeDefined();
	});

	it("shows streaming indicator when streaming", () => {
		useChatStore.setState({
			isStreaming: true,
			streamingContent: "응답 중...",
		});
		render(<ChatPanel />);
		expect(screen.getByText(/응답 중/)).toBeDefined();
	});

	it("sets pendingAudio on audio chunk", async () => {
		// Set up API key so sendChatMessage is actually called
		localStorage.setItem(
			"cafelua-config",
			JSON.stringify({
				apiKey: "test-key",
				provider: "gemini",
				model: "gemini-2.5-flash",
			}),
		);

		render(<ChatPanel />);
		const input = screen.getByPlaceholderText(/메시지|message/i);
		fireEvent.change(input, { target: { value: "안녕" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await new Promise((r) => setTimeout(r, 50));

		// Simulate audio chunk via captured callback
		expect(capturedOnChunk).not.toBeNull();
		capturedOnChunk!({
			type: "audio",
			requestId: "req-1",
			data: "base64audio==",
		});

		expect(useAvatarStore.getState().pendingAudio).toBe("base64audio==");

		localStorage.removeItem("cafelua-config");
	});
});
