import { afterEach, describe, expect, it } from "vitest";
import { useChatStore } from "../chat";

describe("useChatStore", () => {
	afterEach(() => {
		useChatStore.setState(useChatStore.getInitialState());
	});

	it("has correct initial state", () => {
		const state = useChatStore.getState();
		expect(state.messages).toEqual([]);
		expect(state.isStreaming).toBe(false);
		expect(state.streamingContent).toBe("");
		expect(state.provider).toBe("gemini");
		expect(state.totalSessionCost).toBe(0);
	});

	it("addMessage adds user message", () => {
		const { addMessage } = useChatStore.getState();
		addMessage({ role: "user", content: "Hello" });
		const { messages } = useChatStore.getState();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
		expect(messages[0].content).toBe("Hello");
		expect(messages[0].id).toBeDefined();
		expect(messages[0].timestamp).toBeDefined();
	});

	it("addMessage adds assistant message", () => {
		const { addMessage } = useChatStore.getState();
		addMessage({ role: "assistant", content: "Hi there!" });
		const { messages } = useChatStore.getState();
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("assistant");
		expect(messages[0].content).toBe("Hi there!");
	});

	it("startStreaming sets streaming state", () => {
		const { startStreaming } = useChatStore.getState();
		startStreaming();
		const state = useChatStore.getState();
		expect(state.isStreaming).toBe(true);
		expect(state.streamingContent).toBe("");
	});

	it("appendStreamChunk accumulates content", () => {
		const store = useChatStore.getState();
		store.startStreaming();
		store.appendStreamChunk("Hello ");
		expect(useChatStore.getState().streamingContent).toBe("Hello ");
		store.appendStreamChunk("world!");
		expect(useChatStore.getState().streamingContent).toBe("Hello world!");
	});

	it("finishStreaming creates assistant message and resets", () => {
		const store = useChatStore.getState();
		store.startStreaming();
		store.appendStreamChunk("Final answer");
		store.finishStreaming();

		const state = useChatStore.getState();
		expect(state.isStreaming).toBe(false);
		expect(state.streamingContent).toBe("");
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0].role).toBe("assistant");
		expect(state.messages[0].content).toBe("Final answer");
	});

	it("finishStreaming does nothing when not streaming", () => {
		const store = useChatStore.getState();
		store.finishStreaming();
		expect(useChatStore.getState().messages).toHaveLength(0);
	});

	it("addCostEntry accumulates totalSessionCost", () => {
		const store = useChatStore.getState();
		store.addCostEntry({
			inputTokens: 100,
			outputTokens: 50,
			cost: 0.001,
			provider: "gemini",
			model: "gemini-2.5-flash",
		});
		expect(useChatStore.getState().totalSessionCost).toBe(0.001);

		store.addCostEntry({
			inputTokens: 200,
			outputTokens: 100,
			cost: 0.002,
			provider: "gemini",
			model: "gemini-2.5-flash",
		});
		expect(useChatStore.getState().totalSessionCost).toBe(0.003);
	});

	it("addCostEntry attaches cost to last assistant message", () => {
		const store = useChatStore.getState();
		store.addMessage({ role: "assistant", content: "response" });
		store.addCostEntry({
			inputTokens: 100,
			outputTokens: 50,
			cost: 0.001,
			provider: "gemini",
			model: "gemini-2.5-flash",
		});
		const msg = useChatStore.getState().messages[0];
		expect(msg.cost).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			cost: 0.001,
			provider: "gemini",
			model: "gemini-2.5-flash",
		});
	});

	it("setProvider changes active provider", () => {
		useChatStore.getState().setProvider("xai");
		expect(useChatStore.getState().provider).toBe("xai");
	});
});
