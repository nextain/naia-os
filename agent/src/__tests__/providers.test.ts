import { describe, expect, it, vi } from "vitest";
import { calculateCost } from "../providers/cost.js";

// Mock @google/genai
vi.mock("@google/genai", () => {
	class MockGoogleGenAI {
		models = {
			generateContentStream: vi.fn().mockResolvedValue({
				async *[Symbol.asyncIterator]() {
					yield {
						text: "Hello ",
						usageMetadata: undefined,
					};
					yield {
						text: "world!",
						usageMetadata: {
							promptTokenCount: 10,
							candidatesTokenCount: 5,
						},
					};
				},
			}),
		};
	}
	return { GoogleGenAI: MockGoogleGenAI };
});

// Mock openai
vi.mock("openai", () => {
	class MockOpenAI {
		chat = {
			completions: {
				create: vi.fn().mockResolvedValue({
					async *[Symbol.asyncIterator]() {
						yield {
							choices: [{ delta: { content: "Grok " } }],
							usage: null,
						};
						yield {
							choices: [{ delta: { content: "says hi" } }],
							usage: {
								prompt_tokens: 20,
								completion_tokens: 10,
							},
						};
					},
				}),
			},
		};
	}
	return { default: MockOpenAI };
});

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
	class MockAnthropic {
		messages = {
			create: vi.fn().mockResolvedValue({
				async *[Symbol.asyncIterator]() {
					yield {
						type: "content_block_delta",
						delta: { type: "text_delta", text: "Claude " },
					};
					yield {
						type: "content_block_delta",
						delta: { type: "text_delta", text: "here" },
					};
					yield {
						type: "message_delta",
						usage: { output_tokens: 8 },
					};
					yield {
						type: "message_start",
						message: { usage: { input_tokens: 15 } },
					};
				},
			}),
		};
	}
	return { default: MockAnthropic };
});

describe("cost calculation", () => {
	it("calculates Gemini cost correctly", () => {
		const cost = calculateCost("gemini-2.5-flash", 1000, 500);
		expect(cost).toBeCloseTo(0.00045, 6);
	});

	it("calculates xAI cost correctly", () => {
		const cost = calculateCost("grok-3-mini", 1000, 500);
		expect(cost).toBeCloseTo(0.00055, 6);
	});

	it("calculates Anthropic cost correctly", () => {
		const cost = calculateCost("claude-sonnet-4-5-20250929", 1000, 500);
		expect(cost).toBeCloseTo(0.0105, 6);
	});

	it("returns 0 for unknown model", () => {
		expect(calculateCost("unknown-model", 100, 50)).toBe(0);
	});
});

describe("Gemini provider", () => {
	it("streams text and usage chunks", async () => {
		const { createGeminiProvider } = await import("../providers/gemini.js");
		const provider = createGeminiProvider("test-key", "gemini-2.5-flash");
		const chunks: unknown[] = [];

		for await (const chunk of provider.stream(
			[{ role: "user", content: "Hi" }],
			"You are Alpha.",
		)) {
			chunks.push(chunk);
		}

		expect(chunks.some((c: any) => c.type === "text")).toBe(true);
		expect(chunks.some((c: any) => c.type === "usage")).toBe(true);
		expect(chunks.some((c: any) => c.type === "finish")).toBe(true);

		const textChunks = chunks.filter((c: any) => c.type === "text");
		const combined = textChunks.map((c: any) => c.text).join("");
		expect(combined).toBe("Hello world!");
	});
});

describe("xAI provider", () => {
	it("streams text and usage chunks", async () => {
		const { createXAIProvider } = await import("../providers/xai.js");
		const provider = createXAIProvider("test-key", "grok-3-mini");
		const chunks: unknown[] = [];

		for await (const chunk of provider.stream(
			[{ role: "user", content: "Hi" }],
			"You are Alpha.",
		)) {
			chunks.push(chunk);
		}

		expect(chunks.some((c: any) => c.type === "text")).toBe(true);
		expect(chunks.some((c: any) => c.type === "usage")).toBe(true);

		const textChunks = chunks.filter((c: any) => c.type === "text");
		const combined = textChunks.map((c: any) => c.text).join("");
		expect(combined).toBe("Grok says hi");
	});
});

describe("Anthropic provider", () => {
	it("streams text and usage chunks", async () => {
		const { createAnthropicProvider } = await import(
			"../providers/anthropic.js"
		);
		const provider = createAnthropicProvider(
			"test-key",
			"claude-sonnet-4-5-20250929",
		);
		const chunks: unknown[] = [];

		for await (const chunk of provider.stream(
			[{ role: "user", content: "Hi" }],
			"You are Alpha.",
		)) {
			chunks.push(chunk);
		}

		expect(chunks.some((c: any) => c.type === "text")).toBe(true);

		const textChunks = chunks.filter((c: any) => c.type === "text");
		const combined = textChunks.map((c: any) => c.text).join("");
		expect(combined).toBe("Claude here");
	});
});
