import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkContradiction, findContradictions } from "../reconsolidation.js";
import type { Fact } from "../types.js";

function makeFact(content: string, entities: string[]): Fact {
	const now = Date.now();
	return {
		id: randomUUID(),
		content,
		entities,
		topics: [],
		createdAt: now,
		updatedAt: now,
		importance: 0.5,
		recallCount: 0,
		lastAccessed: now,
		strength: 0.5,
		sourceEpisodes: [],
	};
}

describe("Reconsolidation", () => {
	describe("checkContradiction", () => {
		it("detects preference change with negation", () => {
			const fact = makeFact("User prefers vim", ["vim"]);
			const result = checkContradiction(
				fact,
				"I no longer use vim, switched to neovim",
			);
			expect(result.action).toBe("update");
		});

		it("detects Korean state change", () => {
			const fact = makeFact("사용자는 Python을 사용", ["Python"]);
			const result = checkContradiction(
				fact,
				"Python 대신 TypeScript로 변경했어",
			);
			expect(result.action).not.toBe("keep");
		});

		it("keeps unrelated facts", () => {
			const fact = makeFact("User prefers dark mode", ["dark mode"]);
			const result = checkContradiction(fact, "The server runs on port 3000");
			expect(result.action).toBe("keep");
			expect(result.reason).toContain("No shared entities");
		});

		it("keeps facts without negation even with entity overlap", () => {
			const fact = makeFact("User uses React", ["React"]);
			const result = checkContradiction(fact, "React has a new version 19");
			expect(result.action).toBe("keep");
		});

		it("detects switched/changed state", () => {
			const fact = makeFact("User works at CompanyA", ["CompanyA"]);
			const result = checkContradiction(
				fact,
				"I switched from CompanyA to CompanyB",
			);
			expect(result.action).not.toBe("keep");
		});
	});

	describe("findContradictions", () => {
		it("finds contradicting facts from a list", () => {
			const facts = [
				makeFact("User prefers tabs", ["tabs"]),
				makeFact("User lives in Seoul", ["Seoul"]),
				makeFact("Project uses webpack", ["webpack"]),
			];

			const results = findContradictions(
				facts,
				"I no longer use tabs, switched to spaces",
			);
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].fact.content).toContain("tabs");
		});

		it("returns empty when no contradictions", () => {
			const facts = [
				makeFact("User uses React", ["React"]),
				makeFact("Server on port 3000", ["port"]),
			];

			const results = findContradictions(facts, "The weather is nice today");
			expect(results).toHaveLength(0);
		});
	});
});
