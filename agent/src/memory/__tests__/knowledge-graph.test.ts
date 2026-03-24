import { describe, expect, it } from "vitest";
import { KnowledgeGraph, emptyKGState } from "../knowledge-graph.js";

describe("KnowledgeGraph", () => {
	describe("touchNode", () => {
		it("creates a new node", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.touchNode("React", Date.now());
			expect(kg.stats.nodeCount).toBe(1);
		});

		it("increments frequency on repeated touch", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);
			kg.touchNode("React", Date.now());
			kg.touchNode("React", Date.now());
			expect(state.nodes.react.frequency).toBe(2);
		});

		it("normalizes entity names to lowercase", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);
			kg.touchNode("TypeScript", Date.now());
			kg.touchNode("typescript", Date.now());
			expect(kg.stats.nodeCount).toBe(1);
			expect(state.nodes.typescript.frequency).toBe(2);
		});
	});

	describe("strengthen (Hebbian learning)", () => {
		it("creates an edge between two entities", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript");
			expect(kg.stats.edgeCount).toBe(1);
		});

		it("strengthens edge on repeated co-occurrence", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);
			kg.strengthen("React", "TypeScript", 0.1);
			const w1 = state.edges["react::typescript"].weight;

			kg.strengthen("React", "TypeScript", 0.1);
			const w2 = state.edges["react::typescript"].weight;

			expect(w2).toBeGreaterThan(w1);
		});

		it("applies diminishing returns", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);

			kg.strengthen("A", "B", 0.1);
			const first = state.edges["a::b"].weight;

			kg.strengthen("A", "B", 0.1);
			const secondDelta = state.edges["a::b"].weight - first;

			kg.strengthen("A", "B", 0.1);
			const thirdDelta = state.edges["a::b"].weight - first - secondDelta;

			// Each successive boost should be smaller
			expect(thirdDelta).toBeLessThan(secondDelta);
		});

		it("caps weight at 1.0", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);
			for (let i = 0; i < 100; i++) {
				kg.strengthen("A", "B", 0.5);
			}
			expect(state.edges["a::b"].weight).toBeLessThanOrEqual(1.0);
		});

		it("ignores self-loops", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "React");
			expect(kg.stats.edgeCount).toBe(0);
		});
	});

	describe("spreadingActivation", () => {
		it("activates direct neighbors", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript", 0.5);
			kg.strengthen("React", "JSX", 0.3);

			const result = kg.spreadingActivation(["React"]);
			expect(result.length).toBeGreaterThan(0);
			const names = result.map((r) => r.entity);
			expect(names).toContain("typescript");
			expect(names).toContain("jsx");
		});

		it("typescript ranks higher than jsx (stronger edge)", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript", 0.8);
			kg.strengthen("React", "JSX", 0.3);

			const result = kg.spreadingActivation(["React"]);
			const tsIdx = result.findIndex((r) => r.entity === "typescript");
			const jsxIdx = result.findIndex((r) => r.entity === "jsx");
			expect(tsIdx).toBeLessThan(jsxIdx);
		});

		it("propagates through intermediate nodes", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript", 0.8);
			kg.strengthen("TypeScript", "Vitest", 0.6);

			const result = kg.spreadingActivation(["React"], 2);
			const names = result.map((r) => r.entity);
			expect(names).toContain("vitest");
		});

		it("does not include seed entities in results", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript", 0.5);

			const result = kg.spreadingActivation(["React"]);
			const names = result.map((r) => r.entity);
			expect(names).not.toContain("react");
		});

		it("returns empty for unknown seeds", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			const result = kg.spreadingActivation(["unknown"]);
			expect(result).toHaveLength(0);
		});
	});

	describe("getNeighbors", () => {
		it("returns all connected entities sorted by weight", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript", 0.8);
			kg.strengthen("React", "JSX", 0.3);
			kg.strengthen("React", "Vitest", 0.5);

			const neighbors = kg.getNeighbors("React");
			expect(neighbors).toHaveLength(3);
			expect(neighbors[0].neighbor).toBe("typescript");
			expect(neighbors[0].weight).toBeGreaterThan(neighbors[1].weight);
		});
	});

	describe("decayEdges", () => {
		it("reduces edge weights", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);
			kg.strengthen("A", "B", 0.5);
			const before = state.edges["a::b"].weight;

			kg.decayEdges(0.9);
			expect(state.edges["a::b"].weight).toBeLessThan(before);
		});

		it("removes edges below threshold", () => {
			const state = emptyKGState();
			const kg = new KnowledgeGraph(state);
			kg.strengthen("A", "B", 0.005);

			const removed = kg.decayEdges(0.5, 0.01);
			expect(removed).toBe(1);
			expect(kg.stats.edgeCount).toBe(0);
		});
	});

	describe("getHubs", () => {
		it("identifies highly connected entities", () => {
			const kg = new KnowledgeGraph(emptyKGState());
			kg.strengthen("React", "TypeScript", 0.5);
			kg.strengthen("React", "JSX", 0.3);
			kg.strengthen("React", "Vitest", 0.4);
			kg.strengthen("TypeScript", "Vitest", 0.2);

			const hubs = kg.getHubs(3);
			expect(hubs[0].entity).toBe("react"); // Most connected
			expect(hubs[0].connectionCount).toBe(3);
		});
	});
});
