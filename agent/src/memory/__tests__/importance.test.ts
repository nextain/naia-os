import { describe, expect, it } from "vitest";
import {
	STORAGE_GATE_THRESHOLD,
	scoreImportance,
	shouldStore,
} from "../importance.js";

describe("Importance Scoring (Amygdala)", () => {
	describe("scoreImportance", () => {
		it("scores user messages higher than assistant messages", () => {
			const userScore = scoreImportance({
				content: "hello world",
				role: "user",
			});
			const assistantScore = scoreImportance({
				content: "hello world",
				role: "assistant",
			});
			expect(userScore.importance).toBeGreaterThan(assistantScore.importance);
		});

		it("detects directive keywords as important", () => {
			const score = scoreImportance({
				content: "You must always use TypeScript for this project",
				role: "user",
			});
			expect(score.importance).toBeGreaterThan(0.5);
		});

		it("detects Korean directive keywords", () => {
			const score = scoreImportance({
				content: "절대 Python 2 쓰지 마세요. 항상 Python 3 사용해야 합니다",
				role: "user",
			});
			expect(score.importance).toBeGreaterThan(0.5);
		});

		it("detects surprise markers", () => {
			const score = scoreImportance({
				content: "That's unexpected, I found a bug in the parser",
				role: "user",
			});
			expect(score.surprise).toBeGreaterThan(0);
		});

		it("detects positive emotion", () => {
			const score = scoreImportance({
				content: "That's perfect! Great work, thank you!",
				role: "user",
			});
			expect(score.emotion).toBeGreaterThan(0.5);
		});

		it("detects negative emotion", () => {
			const score = scoreImportance({
				content: "This is terrible and frustrating, I hate this bug",
				role: "user",
			});
			expect(score.emotion).toBeLessThan(0.5);
		});

		it("returns neutral emotion for neutral text", () => {
			const score = scoreImportance({
				content: "The function takes two parameters and returns a string",
				role: "assistant",
			});
			expect(score.emotion).toBeCloseTo(0.5, 1);
		});

		it("tool messages get low base importance", () => {
			const score = scoreImportance({
				content: "Command executed successfully. Output: OK",
				role: "tool",
			});
			expect(score.importance).toBeLessThan(0.3);
		});

		it("utility combines all axes", () => {
			const score = scoreImportance({
				content: "This is a critical and unexpected bug! I'm very frustrated",
				role: "user",
			});
			expect(score.utility).toBeGreaterThan(0.3);
			expect(score.importance).toBeGreaterThan(0);
			expect(score.surprise).toBeGreaterThan(0);
		});
	});

	describe("shouldStore (gating)", () => {
		it("stores high-utility inputs", () => {
			const score = scoreImportance({
				content: "I decided to always use tabs for indentation",
				role: "user",
			});
			expect(shouldStore(score)).toBe(true);
		});

		it("gates out trivial tool outputs", () => {
			const score = scoreImportance({
				content: "ok",
				role: "tool",
			});
			expect(shouldStore(score)).toBe(false);
		});

		it("threshold is reasonable", () => {
			expect(STORAGE_GATE_THRESHOLD).toBeGreaterThan(0);
			expect(STORAGE_GATE_THRESHOLD).toBeLessThan(0.5);
		});
	});
});
