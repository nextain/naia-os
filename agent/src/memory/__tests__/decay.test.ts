import { describe, expect, it } from "vitest";
import {
	PRUNE_THRESHOLD,
	calculatePruneScore,
	calculateStrength,
	shouldPrune,
} from "../decay.js";

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

describe("Ebbinghaus Forgetting Curve", () => {
	describe("calculateStrength", () => {
		it("returns full strength for just-created high-importance memory", () => {
			const now = Date.now();
			const strength = calculateStrength(1.0, now, 0, now, now);
			expect(strength).toBe(1.0);
		});

		it("decays over time", () => {
			const now = Date.now();
			const created = now - DAY;
			const s1 = calculateStrength(0.5, created, 0, created, now);
			const s0 = calculateStrength(0.5, created, 0, created, created);
			expect(s1).toBeLessThan(s0);
		});

		it("high importance decays slower than low importance", () => {
			const now = Date.now();
			const created = now - 7 * DAY;
			const highImp = calculateStrength(0.9, created, 0, created, now);
			const lowImp = calculateStrength(0.2, created, 0, created, now);
			expect(highImp).toBeGreaterThan(lowImp);
		});

		it("recall count boosts strength", () => {
			const now = Date.now();
			const created = now - DAY;
			const noRecall = calculateStrength(0.5, created, 0, created, now);
			const withRecall = calculateStrength(0.5, created, 3, created, now);
			expect(withRecall).toBeGreaterThan(noRecall);
		});

		it("recent access resets decay clock", () => {
			const now = Date.now();
			const created = now - 7 * DAY;
			const recentAccess = now - HOUR;
			const oldAccess = calculateStrength(0.5, created, 1, created, now);
			const freshAccess = calculateStrength(0.5, created, 1, recentAccess, now);
			expect(freshAccess).toBeGreaterThan(oldAccess);
		});

		it("never returns below MIN_STRENGTH", () => {
			const now = Date.now();
			const veryOld = now - 365 * DAY;
			const strength = calculateStrength(0.01, veryOld, 0, veryOld, now);
			expect(strength).toBeGreaterThanOrEqual(0.01);
		});

		it("very old low-importance memories eventually become pruneable", () => {
			const now = Date.now();
			const veryOld = now - 90 * DAY;
			const strength = calculateStrength(0.1, veryOld, 0, veryOld, now);
			expect(shouldPrune(strength)).toBe(true);
		});

		it("high-importance memories survive longer", () => {
			const now = Date.now();
			const monthOld = now - 30 * DAY;
			const strength = calculateStrength(0.9, monthOld, 0, monthOld, now);
			expect(shouldPrune(strength)).toBe(false);
		});
	});

	describe("calculatePruneScore", () => {
		it("increases with token size", () => {
			const s1 = calculatePruneScore(100, 1);
			const s2 = calculatePruneScore(500, 1);
			expect(s2).toBeGreaterThan(s1);
		});

		it("increases with age", () => {
			const s1 = calculatePruneScore(100, 1);
			const s2 = calculatePruneScore(100, 24);
			expect(s2).toBeGreaterThan(s1);
		});

		it("uses logarithmic age weight", () => {
			// Age doubles shouldn't double the score (log scale)
			const s1 = calculatePruneScore(100, 10);
			const s2 = calculatePruneScore(100, 20);
			const ratio = s2 / s1;
			expect(ratio).toBeLessThan(2);
			expect(ratio).toBeGreaterThan(1);
		});
	});
});
