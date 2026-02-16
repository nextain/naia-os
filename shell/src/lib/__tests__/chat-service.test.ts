import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockListen = vi.fn();
let mockUnlisten: ReturnType<typeof vi.fn>;

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: (...args: unknown[]) => mockListen(...args),
}));

describe("chat-service", () => {
	beforeEach(() => {
		mockUnlisten = vi.fn();
		mockInvoke.mockResolvedValue(undefined);
		mockListen.mockResolvedValue(mockUnlisten);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sendChatMessage invokes Tauri command and listens for events", async () => {
		const { sendChatMessage } = await import("../chat-service");

		const onChunk = vi.fn();

		// Simulate: after listen is called, we call the handler with some chunks
		mockListen.mockImplementation(
			async (_event: string, handler: (event: { payload: string }) => void) => {
				// Simulate agent responses
				setTimeout(() => {
					handler({
						payload: JSON.stringify({
							type: "text",
							requestId: "req-1",
							text: "Hello",
						}),
					});
					handler({
						payload: JSON.stringify({
							type: "usage",
							requestId: "req-1",
							inputTokens: 100,
							outputTokens: 50,
							cost: 0.001,
							model: "gemini-2.5-flash",
						}),
					});
					handler({
						payload: JSON.stringify({
							type: "finish",
							requestId: "req-1",
						}),
					});
				}, 10);
				return mockUnlisten;
			},
		);

		const result = await sendChatMessage({
			message: "Hi",
			provider: {
				provider: "gemini",
				model: "gemini-2.5-flash",
				apiKey: "test-key",
			},
			history: [],
			onChunk,
			requestId: "req-1",
		});

		// Should have invoked send_to_agent_command
		expect(mockInvoke).toHaveBeenCalledWith("send_to_agent_command", {
			message: expect.stringContaining("chat_request"),
		});

		// Wait for async handlers
		await new Promise((r) => setTimeout(r, 50));

		// onChunk should have been called for text and usage
		expect(onChunk).toHaveBeenCalled();
		const textCalls = onChunk.mock.calls.filter(
			(c: any[]) => c[0].type === "text",
		);
		expect(textCalls).toHaveLength(1);
		expect(textCalls[0][0].text).toBe("Hello");
	});

	it("cancelChat invokes cancel_stream command", async () => {
		const { cancelChat } = await import("../chat-service");
		await cancelChat("req-1");
		expect(mockInvoke).toHaveBeenCalledWith("cancel_stream", {
			requestId: "req-1",
		});
	});
});
