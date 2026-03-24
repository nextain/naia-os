/**
 * Alpha Memory Benchmark Runner
 *
 * Executes all benchmark tests and produces a structured report.
 * Run: pnpm exec tsx src/memory/benchmark/runner.ts
 * Output: JSON report to stdout, human-readable summary to stderr.
 */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAdapter } from "../local-adapter.js";
import { MemorySystem } from "../index.js";
import { calculateStrength } from "../decay.js";
import { scoreImportance } from "../importance.js";
import { KnowledgeGraph, emptyKGState } from "../knowledge-graph.js";
import { checkContradiction, findContradictions } from "../reconsolidation.js";
import type { Episode, Fact, ImportanceScore } from "../types.js";
import {
	ADOPTED_CRITERIA,
	ALPHA_CRITERIA,
	INDUSTRY_CRITERIA,
	type BenchmarkReport,
	type BenchmarkResult,
	type CriterionCategory,
} from "./criteria.js";

const HOUR = 3600_000;
const DAY = 86400_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function grade(
	value: number,
	target: number,
	minimum: number,
): "pass" | "warn" | "fail" {
	if (value >= target) return "pass";
	if (value >= minimum) return "warn";
	return "fail";
}

function makeEpisode(
	content: string,
	overrides: Partial<Episode> = {},
): Episode {
	const now = Date.now();
	return {
		id: randomUUID(),
		content,
		summary: content.slice(0, 200),
		timestamp: now,
		importance: { importance: 0.5, surprise: 0.1, emotion: 0.5, utility: 0.5 },
		encodingContext: { project: "benchmark" },
		consolidated: false,
		recallCount: 0,
		lastAccessed: now,
		strength: 0.5,
		...overrides,
	};
}

function makeFact(
	content: string,
	entities: string[],
	overrides: Partial<Fact> = {},
): Fact {
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
		...overrides,
	};
}

// ─── Benchmark Tests ────────────────────────────────────────────────────────

async function benchDecayCurve(): Promise<BenchmarkResult> {
	// Test that calculateStrength follows the theoretical Ebbinghaus curve.
	// Sample 20 time points, compute R² against theoretical.
	const importance = 0.6;
	const recallCount = 0;
	const createdAt = 0;
	const lastAccessed = 0;

	const timePoints = Array.from({ length: 20 }, (_, i) => i * DAY);
	const actual = timePoints.map((t) =>
		calculateStrength(importance, createdAt, recallCount, lastAccessed, t),
	);

	// Theoretical: importance × e^(-λ_eff × days)
	const lambdaEff = 0.16 * (1 - importance * 0.8);
	const theoretical = timePoints.map((t) => {
		const days = t / DAY;
		return Math.max(0.01, importance * Math.exp(-lambdaEff * days));
	});

	// R² calculation
	const meanActual = actual.reduce((a, b) => a + b, 0) / actual.length;
	const ssRes = actual.reduce(
		(sum, a, i) => sum + (a - theoretical[i]) ** 2,
		0,
	);
	const ssTot = actual.reduce((sum, a) => sum + (a - meanActual) ** 2, 0);
	const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

	return {
		criterion: "decayCurveAccuracy",
		category: "alpha-original",
		metric: "r_squared",
		value: rSquared,
		target: ALPHA_CRITERIA.decayCurveAccuracy.target,
		minimum: ALPHA_CRITERIA.decayCurveAccuracy.minimum,
		passed: rSquared >= ALPHA_CRITERIA.decayCurveAccuracy.target,
		grade: grade(
			rSquared,
			ALPHA_CRITERIA.decayCurveAccuracy.target,
			ALPHA_CRITERIA.decayCurveAccuracy.minimum,
		),
	};
}

async function benchRecallStrengthening(): Promise<BenchmarkResult> {
	const importance = 0.5;
	const created = 0;
	const now = 3 * DAY;

	const noRecall = calculateStrength(importance, created, 0, created, now);
	const withRecalls = calculateStrength(importance, created, 3, created, now);
	const increase = (withRecalls - noRecall) / noRecall;

	return {
		criterion: "recallStrengthening",
		category: "alpha-original",
		metric: "relative_increase",
		value: increase,
		target: ALPHA_CRITERIA.recallStrengthening.target,
		minimum: ALPHA_CRITERIA.recallStrengthening.minimum,
		passed: increase >= ALPHA_CRITERIA.recallStrengthening.target,
		grade: grade(
			increase,
			ALPHA_CRITERIA.recallStrengthening.target,
			ALPHA_CRITERIA.recallStrengthening.minimum,
		),
	};
}

async function benchSpreadingActivation(): Promise<BenchmarkResult> {
	const kg = new KnowledgeGraph(emptyKGState());

	// Build known topology
	kg.strengthen("React", "TypeScript", 0.8);
	kg.strengthen("React", "JSX", 0.7);
	kg.strengthen("TypeScript", "Vitest", 0.6);
	kg.strengthen("TypeScript", "Node", 0.5);
	kg.strengthen("Vitest", "Testing", 0.4);
	kg.strengthen("Python", "Django", 0.7);
	kg.strengthen("Python", "FastAPI", 0.6);

	// Expected: seeding "react" should activate typescript, jsx, vitest, node
	const expectedTargets = ["typescript", "jsx", "vitest", "node"];
	const result = kg.spreadingActivation(["react"], 2);
	const activated = result.slice(0, 5).map((r) => r.entity);

	let hits = 0;
	for (const target of expectedTargets) {
		if (activated.includes(target)) hits++;
	}
	const precisionAt5 = hits / Math.min(5, expectedTargets.length);

	return {
		criterion: "spreadingActivation",
		category: "alpha-original",
		metric: "precision_at_k",
		value: precisionAt5,
		target: ALPHA_CRITERIA.spreadingActivation.target,
		minimum: ALPHA_CRITERIA.spreadingActivation.minimum,
		passed: precisionAt5 >= ALPHA_CRITERIA.spreadingActivation.target,
		grade: grade(
			precisionAt5,
			ALPHA_CRITERIA.spreadingActivation.target,
			ALPHA_CRITERIA.spreadingActivation.minimum,
		),
	};
}

async function benchHebbianCorrelation(): Promise<BenchmarkResult> {
	const kg = new KnowledgeGraph(emptyKGState());

	// Create pairs with known co-occurrence frequencies
	const pairs: Array<{ a: string; b: string; freq: number }> = [
		{ a: "react", b: "typescript", freq: 20 },
		{ a: "react", b: "css", freq: 10 },
		{ a: "react", b: "webpack", freq: 5 },
		{ a: "react", b: "docker", freq: 2 },
		{ a: "react", b: "kubernetes", freq: 1 },
	];

	for (const { a, b, freq } of pairs) {
		for (let i = 0; i < freq; i++) {
			kg.strengthen(a, b, 0.1);
		}
	}

	// Get weights and compute Spearman rank correlation
	const freqs = pairs.map((p) => p.freq);
	const weights = pairs.map((p) => {
		const neighbors = kg.getNeighbors(p.a);
		const edge = neighbors.find((n) => n.neighbor === p.b);
		return edge?.weight ?? 0;
	});

	const rho = spearmanRho(freqs, weights);

	return {
		criterion: "hebbianCorrelation",
		category: "alpha-original",
		metric: "spearman_rho",
		value: rho,
		target: ALPHA_CRITERIA.hebbianCorrelation.target,
		minimum: ALPHA_CRITERIA.hebbianCorrelation.minimum,
		passed: rho >= ALPHA_CRITERIA.hebbianCorrelation.target,
		grade: grade(
			rho,
			ALPHA_CRITERIA.hebbianCorrelation.target,
			ALPHA_CRITERIA.hebbianCorrelation.minimum,
		),
	};
}

async function benchContradictionDetection(): Promise<BenchmarkResult> {
	// Test cases: [existing fact, new info, should_detect]
	const cases: Array<{
		fact: Fact;
		newInfo: string;
		expected: boolean;
	}> = [
		// True contradictions (should detect)
		{
			fact: makeFact("User prefers vim", ["vim"]),
			newInfo: "I no longer use vim, switched to neovim",
			expected: true,
		},
		{
			fact: makeFact("User works at CompanyA", ["CompanyA"]),
			newInfo: "I changed from CompanyA to CompanyB",
			expected: true,
		},
		{
			fact: makeFact("Project uses webpack", ["webpack"]),
			newInfo: "We replaced webpack with Vite instead",
			expected: true,
		},
		{
			fact: makeFact("사용자는 Python 사용", ["Python"]),
			newInfo: "Python 대신 TypeScript로 변경했어",
			expected: true,
		},
		{
			fact: makeFact("User prefers dark mode", ["dark mode"]),
			newInfo: "I actually switched from dark mode to light mode",
			expected: true,
		},
		// Non-contradictions (should NOT detect)
		{
			fact: makeFact("User prefers TypeScript", ["TypeScript"]),
			newInfo: "TypeScript 5.0 was just released",
			expected: false,
		},
		{
			fact: makeFact("Server runs on port 3000", ["port"]),
			newInfo: "The weather is nice today",
			expected: false,
		},
		{
			fact: makeFact("User lives in Seoul", ["Seoul"]),
			newInfo: "Seoul has great public transportation",
			expected: false,
		},
		{
			fact: makeFact("Project uses React", ["React"]),
			newInfo: "React 19 has new features",
			expected: false,
		},
		{
			fact: makeFact("User likes coffee", ["coffee"]),
			newInfo: "I also enjoy tea in the afternoon",
			expected: false,
		},
	];

	let truePositives = 0;
	let falsePositives = 0;
	let trueNegatives = 0;
	let falseNegatives = 0;

	for (const { fact, newInfo, expected } of cases) {
		const result = checkContradiction(fact, newInfo);
		const detected = result.action !== "keep";

		if (expected && detected) truePositives++;
		else if (expected && !detected) falseNegatives++;
		else if (!expected && detected) falsePositives++;
		else trueNegatives++;
	}

	const precision =
		truePositives + falsePositives > 0
			? truePositives / (truePositives + falsePositives)
			: 0;
	const recall =
		truePositives + falseNegatives > 0
			? truePositives / (truePositives + falseNegatives)
			: 0;

	const target = ALPHA_CRITERIA.contradictionDetection.target;
	const minimum = ALPHA_CRITERIA.contradictionDetection.minimum;
	const passed = precision >= target.precision && recall >= target.recall;
	const aboveMinimum =
		precision >= minimum.precision && recall >= minimum.recall;

	return {
		criterion: "contradictionDetection",
		category: "alpha-original",
		metric: "precision_recall",
		value: { precision, recall },
		target,
		minimum,
		passed,
		grade: passed ? "pass" : aboveMinimum ? "warn" : "fail",
	};
}

async function benchReconsolidation(): Promise<BenchmarkResult> {
	const adapter = new LocalAdapter(join(tmpdir(), `alpha-bench-${randomUUID()}.json`));
	const now = Date.now();

	// 1. Store original fact
	const factId = randomUUID();
	await adapter.semantic.upsert(
		makeFact("User prefers tabs", ["tabs"], { id: factId }),
	);

	// 2. Encode contradicting info via MemorySystem
	const system = new MemorySystem({ adapter });
	await system.encode(
		{ content: "I no longer use tabs, I switched to spaces instead", role: "user" },
		{ project: "benchmark" },
	);

	// 3. Verify reconsolidation
	const facts = await adapter.semantic.getAll();
	const updatedFact = facts.find((f) => f.id === factId);

	let score = 0;
	const checks = 3;

	// Check 1: fact was updated (not duplicated)
	const tabsFacts = facts.filter(
		(f) => f.entities.includes("tabs") || f.content.includes("tabs"),
	);
	if (tabsFacts.length <= 1) score++;

	// Check 2: new content is retrievable
	if (updatedFact && updatedFact.content.includes("spaces")) score++;

	// Check 3: unrelated facts unaffected
	const unrelatedId = randomUUID();
	await adapter.semantic.upsert(
		makeFact("Server runs on port 3000", ["port"], { id: unrelatedId }),
	);
	await system.encode(
		{ content: "I actually prefer dark mode now, not light mode", role: "user" },
		{ project: "benchmark" },
	);
	const portFact = (await adapter.semantic.getAll()).find(
		(f) => f.id === unrelatedId,
	);
	if (portFact && portFact.content === "Server runs on port 3000") score++;

	const passRate = score / checks;
	await system.close();

	return {
		criterion: "reconsolidation",
		category: "alpha-original",
		metric: "pass_rate",
		value: passRate,
		target: ALPHA_CRITERIA.reconsolidation.target,
		minimum: ALPHA_CRITERIA.reconsolidation.minimum,
		passed: passRate >= ALPHA_CRITERIA.reconsolidation.target,
		grade: grade(
			passRate,
			ALPHA_CRITERIA.reconsolidation.target,
			ALPHA_CRITERIA.reconsolidation.minimum,
		),
	};
}

async function benchImportanceGating(): Promise<BenchmarkResult> {
	// Test cases: [content, role, should_store]
	const cases: Array<{
		content: string;
		role: "user" | "assistant" | "tool";
		expected: boolean;
	}> = [
		// Should store (important)
		{ content: "I always want TypeScript, never JavaScript", role: "user", expected: true },
		{ content: "We decided to use Vitest for all testing", role: "user", expected: true },
		{ content: "절대 Python 2 쓰지 마세요", role: "user", expected: true },
		{ content: "This is a critical bug that must be fixed", role: "user", expected: true },
		{ content: "I prefer tabs over spaces for indentation", role: "user", expected: true },
		// Should NOT store (trivial)
		{ content: "ok", role: "tool", expected: false },
		{ content: "Done.", role: "tool", expected: false },
		{ content: "yes", role: "tool", expected: false },
		{ content: "Command executed successfully", role: "tool", expected: false },
		{ content: "3 files changed", role: "tool", expected: false },
	];

	let truePositives = 0;
	let falsePositives = 0;
	let trueNegatives = 0;
	let falseNegatives = 0;

	for (const { content, role, expected } of cases) {
		const score = scoreImportance({ content, role });
		const stored = score.utility >= 0.15; // STORAGE_GATE_THRESHOLD

		if (expected && stored) truePositives++;
		else if (expected && !stored) falseNegatives++;
		else if (!expected && stored) falsePositives++;
		else trueNegatives++;
	}

	const precision =
		truePositives + falsePositives > 0
			? truePositives / (truePositives + falsePositives)
			: 0;
	const recall =
		truePositives + falseNegatives > 0
			? truePositives / (truePositives + falseNegatives)
			: 0;
	const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

	const target = ADOPTED_CRITERIA.importanceGating.target;
	const minimum = ADOPTED_CRITERIA.importanceGating.minimum;
	const passed =
		precision >= target.precision &&
		recall >= target.recall &&
		f1 >= target.f1;
	const aboveMinimum =
		precision >= minimum.precision &&
		recall >= minimum.recall &&
		f1 >= minimum.f1;

	return {
		criterion: "importanceGating",
		category: "adopted",
		metric: "precision_recall_f1",
		value: { precision, recall, f1 },
		target,
		minimum,
		passed,
		grade: passed ? "pass" : aboveMinimum ? "warn" : "fail",
	};
}

async function benchContextDependentRetrieval(): Promise<BenchmarkResult> {
	const adapter = new LocalAdapter(join(tmpdir(), `alpha-bench-${randomUUID()}.json`));
	const now = Date.now();

	// Store two identical episodes with different contexts
	await adapter.episode.store(
		makeEpisode("Fixed critical memory leak in component", {
			encodingContext: { project: "naia-os" },
			timestamp: now - HOUR,
			lastAccessed: now - HOUR,
		}),
	);
	await adapter.episode.store(
		makeEpisode("Fixed critical memory leak in component", {
			encodingContext: { project: "other-project" },
			timestamp: now - HOUR,
			lastAccessed: now - HOUR,
		}),
	);

	// Recall with naia-os context
	const results = await adapter.episode.recall("memory leak", {
		project: "naia-os",
		topK: 5,
	});

	// Context-matched should be first
	const contextMatched =
		results.length > 0 && results[0].encodingContext.project === "naia-os"
			? 1
			: 0;

	await adapter.close();

	return {
		criterion: "contextDependentRetrieval",
		category: "alpha-original",
		metric: "top_ratio",
		value: contextMatched,
		target: ALPHA_CRITERIA.contextDependentRetrieval.target,
		minimum: ALPHA_CRITERIA.contextDependentRetrieval.minimum,
		passed: contextMatched >= ALPHA_CRITERIA.contextDependentRetrieval.target,
		grade: grade(
			contextMatched,
			ALPHA_CRITERIA.contextDependentRetrieval.target,
			ALPHA_CRITERIA.contextDependentRetrieval.minimum,
		),
	};
}

async function benchImportanceRetention(): Promise<BenchmarkResult> {
	const adapter = new LocalAdapter(join(tmpdir(), `alpha-bench-${randomUUID()}.json`));
	const now = Date.now();
	const oldTime = now - 60 * DAY;

	// Create memories with varying importance, all old
	const memories = [
		{ importance: 0.9, label: "high" },
		{ importance: 0.8, label: "high" },
		{ importance: 0.7, label: "high" },
		{ importance: 0.15, label: "low" },
		{ importance: 0.1, label: "low" },
		{ importance: 0.05, label: "low" },
	];

	for (const m of memories) {
		await adapter.semantic.upsert(
			makeFact(`Fact with importance ${m.importance}`, [`entity-${m.label}`], {
				importance: m.importance,
				createdAt: oldTime,
				lastAccessed: oldTime,
			}),
		);
	}

	// Run decay
	await adapter.semantic.decay(now);

	// Check survival
	const surviving = await adapter.semantic.getAll();
	const highSurvived = surviving.filter((f) =>
		f.entities.some((e) => e.includes("high")),
	).length;
	const lowSurvived = surviving.filter((f) =>
		f.entities.some((e) => e.includes("low")),
	).length;

	// Point-biserial: high importance should survive more
	const totalHigh = 3;
	const totalLow = 3;
	const highRate = highSurvived / totalHigh;
	const lowRate = lowSurvived / totalLow;

	// Simple correlation proxy: difference in survival rates
	const correlation = highRate - lowRate;

	await adapter.close();

	return {
		criterion: "importanceRetention",
		category: "alpha-original",
		metric: "correlation",
		value: correlation,
		target: ALPHA_CRITERIA.importanceRetention.target,
		minimum: ALPHA_CRITERIA.importanceRetention.minimum,
		passed: correlation >= ALPHA_CRITERIA.importanceRetention.target,
		grade: grade(
			correlation,
			ALPHA_CRITERIA.importanceRetention.target,
			ALPHA_CRITERIA.importanceRetention.minimum,
		),
	};
}

async function benchConsolidationCompression(): Promise<BenchmarkResult> {
	const adapter = new LocalAdapter(join(tmpdir(), `alpha-bench-${randomUUID()}.json`));
	const system = new MemorySystem({ adapter });
	const now = Date.now();
	const twoHoursAgo = now - 2 * HOUR;

	// Store 6 episodes with decision keywords
	const episodes = [
		"We decided to use TypeScript for the frontend",
		"Team chose React over Vue for the UI",
		"We always prefer functional components",
		"Never use class components going forward",
		"We must use ESLint for all linting",
		"Team decided on Vitest instead of Jest",
	];

	for (const content of episodes) {
		await adapter.episode.store(
			makeEpisode(content, {
				timestamp: twoHoursAgo,
				lastAccessed: twoHoursAgo,
				importance: { importance: 0.6, surprise: 0.1, emotion: 0.5, utility: 0.5 },
			}),
		);
	}

	const result = await system.consolidateNow();
	const factsCreated = result.factsCreated;
	const ratio = episodes.length / Math.max(1, factsCreated);

	const target = ALPHA_CRITERIA.consolidationCompression.target;
	const minimum = ALPHA_CRITERIA.consolidationCompression.minimum;
	const passed = ratio >= target.min && ratio <= target.max;
	const aboveMinimum = ratio >= minimum.min && ratio <= minimum.max;

	await system.close();

	return {
		criterion: "consolidationCompression",
		category: "alpha-original",
		metric: "ratio_range",
		value: { ratio, episodes: episodes.length, facts: factsCreated },
		target,
		minimum,
		passed,
		grade: passed ? "pass" : aboveMinimum ? "warn" : "fail",
	};
}

// ─── Spearman Rank Correlation ──────────────────────────────────────────────

function spearmanRho(x: number[], y: number[]): number {
	const n = x.length;
	if (n < 2) return 0;

	const rankX = ranks(x);
	const rankY = ranks(y);

	let sumD2 = 0;
	for (let i = 0; i < n; i++) {
		sumD2 += (rankX[i] - rankY[i]) ** 2;
	}

	return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function ranks(arr: number[]): number[] {
	const sorted = arr
		.map((v, i) => ({ v, i }))
		.sort((a, b) => a.v - b.v);
	const result = new Array<number>(arr.length);
	for (let i = 0; i < sorted.length; i++) {
		result[sorted[i].i] = i + 1;
	}
	return result;
}

// ─── Main Runner ────────────────────────────────────────────────────────────

async function runBenchmarks(): Promise<BenchmarkReport> {
	const results: BenchmarkResult[] = [];

	// Alpha-original criteria
	results.push(await benchDecayCurve());
	results.push(await benchRecallStrengthening());
	results.push(await benchSpreadingActivation());
	results.push(await benchHebbianCorrelation());
	results.push(await benchContradictionDetection());
	results.push(await benchReconsolidation());
	results.push(await benchContextDependentRetrieval());
	results.push(await benchImportanceRetention());
	results.push(await benchConsolidationCompression());

	// Adopted criteria
	results.push(await benchImportanceGating());

	const passed = results.filter((r) => r.grade === "pass").length;
	const warned = results.filter((r) => r.grade === "warn").length;
	const failed = results.filter((r) => r.grade === "fail").length;

	return {
		timestamp: new Date().toISOString(),
		version: "0.1.0",
		summary: {
			total: results.length,
			passed,
			warned,
			failed,
			passRate: passed / results.length,
		},
		results,
	};
}

// ─── Output Formatting ─────────────────────────────────────────────────────

function formatReport(report: BenchmarkReport): string {
	const lines: string[] = [];
	lines.push("═══════════════════════════════════════════════════════════");
	lines.push("  Alpha Memory System — Benchmark Report");
	lines.push(`  ${report.timestamp}  (v${report.version})`);
	lines.push("═══════════════════════════════════════════════════════════");
	lines.push("");
	lines.push(
		`  Summary: ${report.summary.passed} pass / ${report.summary.warned} warn / ${report.summary.failed} fail  (${Math.round(report.summary.passRate * 100)}%)`,
	);
	lines.push("");

	const categories: Array<{
		label: string;
		cat: string;
	}> = [
		{ label: "Alpha-Original Criteria (our standards)", cat: "alpha-original" },
		{ label: "Adopted Criteria (from research)", cat: "adopted" },
		{ label: "Industry Criteria", cat: "industry" },
	];

	for (const { label, cat } of categories) {
		const catResults = report.results.filter((r) => r.category === cat);
		if (catResults.length === 0) continue;

		lines.push(`── ${label} ${"─".repeat(Math.max(0, 55 - label.length))}`);
		for (const r of catResults) {
			const icon = r.grade === "pass" ? "✓" : r.grade === "warn" ? "△" : "✗";
			const valueStr =
				typeof r.value === "number"
					? r.value.toFixed(3)
					: JSON.stringify(r.value);
			const targetStr =
				typeof r.target === "number"
					? r.target.toFixed(2)
					: JSON.stringify(r.target);
			lines.push(
				`  ${icon} ${r.criterion.padEnd(30)} ${valueStr.padStart(20)}  (target: ${targetStr})`,
			);
		}
		lines.push("");
	}

	return lines.join("\n");
}

// ─── Entry Point ────────────────────────────────────────────────────────────

const report = await runBenchmarks();
console.error(formatReport(report));
console.log(JSON.stringify(report, null, "\t"));
