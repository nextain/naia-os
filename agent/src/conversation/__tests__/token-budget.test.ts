import { describe, it, expect } from "vitest";
import { estimateTokens, checkTokenBudget } from "../token-budget.js";
import { getContextWindow } from "../context-limits.js";

describe("getContextWindow", () => {
	it("returns exact match for known models", () => {
		expect(getContextWindow("claude-sonnet-4-5-20250929")).toBe(200_000);
		expect(getContextWindow("gpt-4o")).toBe(128_000);
		expect(getContextWindow("gemini-2.5-flash")).toBe(1_000_000);
	});

	it("returns prefix match for partial model names", () => {
		expect(getContextWindow("claude-sonnet-4-5")).toBe(200_000);
	});

	it("returns conservative default for unknown models", () => {
		expect(getContextWindow("unknown-model-xyz")).toBe(32_768);
	});
});

describe("estimateTokens", () => {
	it("estimates tokens from message content", () => {
		const messages = [
			{ role: "user", content: "Hello world" }, // 11 chars → ~3 tokens + 4 overhead = 7
		];
		const estimate = estimateTokens(messages);
		expect(estimate).toBeGreaterThan(0);
		expect(estimate).toBeLessThan(20);
	});

	it("handles empty messages", () => {
		expect(estimateTokens([])).toBe(0);
	});

	it("handles large message arrays", () => {
		const messages = Array.from({ length: 100 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "assistant",
			content: "A".repeat(1000), // 1000 chars each
		}));
		const estimate = estimateTokens(messages);
		// 100 messages × (250 tokens + 4 overhead) ≈ 25400
		expect(estimate).toBeGreaterThan(20000);
		expect(estimate).toBeLessThan(30000);
	});
});

describe("checkTokenBudget", () => {
	it("returns ok for small conversations", () => {
		const messages = [{ role: "user", content: "Hello" }];
		const result = checkTokenBudget(messages, "claude-sonnet-4-5-20250929");
		expect(result.status).toBe("ok");
		expect(result.usagePercent).toBeLessThan(0.01);
	});

	it("returns warning at 85% usage", () => {
		// claude-sonnet: 200K context. 85% = 170K tokens.
		// At 4 chars/token, need ~680K chars to hit 85%.
		const bigContent = "A".repeat(680_000);
		const messages = [{ role: "user", content: bigContent }];
		const result = checkTokenBudget(messages, "claude-sonnet-4-5-20250929");
		expect(result.status).toBe("warning");
		expect(result.message).toContain("warning");
	});

	it("returns critical at 95% usage", () => {
		// 95% of 200K = 190K tokens → ~760K chars
		const bigContent = "A".repeat(780_000);
		const messages = [{ role: "user", content: bigContent }];
		const result = checkTokenBudget(messages, "claude-sonnet-4-5-20250929");
		expect(result.status).toBe("critical");
		expect(result.message).toContain("critical");
	});

	it("includes system prompt in estimate", () => {
		const messages = [{ role: "user", content: "A".repeat(600_000) }];
		const systemPrompt = "A".repeat(200_000);

		const withoutSystem = checkTokenBudget(messages, "claude-sonnet-4-5-20250929");
		const withSystem = checkTokenBudget(messages, "claude-sonnet-4-5-20250929", systemPrompt);

		expect(withSystem.estimatedTokens).toBeGreaterThan(withoutSystem.estimatedTokens);
	});

	it("is more restrictive for smaller context window models", () => {
		// 120K chars → ~30K tokens. Within 200K window but near 32K window.
		const messages = [{ role: "user", content: "A".repeat(120_000) }];

		const large = checkTokenBudget(messages, "claude-sonnet-4-5-20250929"); // 200K
		const small = checkTokenBudget(messages, "qwen3-8b"); // 32K

		expect(large.status).toBe("ok");
		expect(small.status).not.toBe("ok"); // warning or critical
	});

	// ── Before vs After improvement verification ────────────────────────────

	describe("improvement verification", () => {
		it("BEFORE: no budget check existed — AFTER: returns actionable status", () => {
			const messages = [
				{ role: "user", content: "What is AI?" },
				{ role: "assistant", content: "AI is..." },
			];
			const result = checkTokenBudget(messages, "gpt-4o");

			// Previously: no check, API would just fail if too large
			// Now: structured result with status, estimate, and percentage
			expect(result).toHaveProperty("status");
			expect(result).toHaveProperty("estimatedTokens");
			expect(result).toHaveProperty("contextWindow");
			expect(result).toHaveProperty("usagePercent");
			expect(["ok", "warning", "critical"]).toContain(result.status);
		});

		it("BEFORE: context overflow crashed session — AFTER: warning before overflow", () => {
			// Simulate a long conversation approaching limit on a small model
			// 50 msgs × 4000 chars = 200K chars → ~50K tokens (exceeds 32K qwen3)
			const longMessages = Array.from({ length: 50 }, (_, i) => ({
				role: i % 2 === 0 ? "user" : "assistant",
				content: "A".repeat(4000),
			}));

			const result = checkTokenBudget(longMessages, "qwen3-8b"); // 32K window
			// Previously: would hit API error with no prior warning
			// Now: returns warning or critical before the LLM call
			expect(result.status).not.toBe("ok");
			expect(result.message).toBeDefined();
		});
	});
});
