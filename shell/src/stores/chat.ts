import { create } from "zustand";
import type { ChatMessage, CostEntry, ProviderId } from "../lib/types";

interface ChatState {
	messages: ChatMessage[];
	isStreaming: boolean;
	streamingContent: string;
	provider: ProviderId;
	totalSessionCost: number;

	addMessage: (msg: Pick<ChatMessage, "role" | "content">) => void;
	startStreaming: () => void;
	appendStreamChunk: (text: string) => void;
	finishStreaming: () => void;
	addCostEntry: (entry: CostEntry) => void;
	setProvider: (provider: ProviderId) => void;
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useChatStore = create<ChatState>()((set, get) => ({
	messages: [],
	isStreaming: false,
	streamingContent: "",
	provider: "gemini",
	totalSessionCost: 0,

	addMessage: (msg) =>
		set((s) => ({
			messages: [
				...s.messages,
				{ ...msg, id: generateId(), timestamp: Date.now() },
			],
		})),

	startStreaming: () => set({ isStreaming: true, streamingContent: "" }),

	appendStreamChunk: (text) =>
		set((s) => ({ streamingContent: s.streamingContent + text })),

	finishStreaming: () => {
		const { isStreaming, streamingContent } = get();
		if (!isStreaming) return;
		set((s) => ({
			isStreaming: false,
			streamingContent: "",
			messages: [
				...s.messages,
				{
					id: generateId(),
					role: "assistant" as const,
					content: streamingContent,
					timestamp: Date.now(),
				},
			],
		}));
	},

	addCostEntry: (entry) =>
		set((s) => {
			const messages = [...s.messages];
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i].role === "assistant") {
					messages[i] = { ...messages[i], cost: entry };
					break;
				}
			}
			return {
				messages,
				totalSessionCost: s.totalSessionCost + entry.cost,
			};
		}),

	setProvider: (provider) => set({ provider }),
}));
