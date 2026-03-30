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
import { LocalAdapter } from "../adapters/local.js";
import { BASE_DECAY, IMPORTANCE_DAMPING, calculateStrength } from "../decay.js";
import { STORAGE_GATE_THRESHOLD, scoreImportance } from "../importance.js";
import { MemorySystem } from "../index.js";
import { KnowledgeGraph, emptyKGState } from "../knowledge-graph.js";
import { checkContradiction, findContradictions } from "../reconsolidation.js";
import type { Episode, Fact, ImportanceScore } from "../types.js";
import {
	ADOPTED_CRITERIA,
	ALPHA_CRITERIA,
	type BenchmarkReport,
	type BenchmarkResult,
	type CriterionCategory,
	INDUSTRY_CRITERIA,
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
	const lambdaEff = BASE_DECAY * (1 - importance * IMPORTANCE_DAMPING);
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
	const adapter = new LocalAdapter(
		join(tmpdir(), `alpha-bench-${randomUUID()}.json`),
	);
	const now = Date.now();

	// 1. Store original fact
	const factId = randomUUID();
	await adapter.semantic.upsert(
		makeFact("User prefers tabs", ["tabs"], { id: factId }),
	);

	// 2. Encode contradicting info via MemorySystem
	const system = new MemorySystem({ adapter });
	await system.encode(
		{
			content: "I no longer use tabs, I switched to spaces instead",
			role: "user",
		},
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
	if (updatedFact?.content.includes("spaces")) score++;

	// Check 3: unrelated facts unaffected
	const unrelatedId = randomUUID();
	await adapter.semantic.upsert(
		makeFact("Server runs on port 3000", ["port"], { id: unrelatedId }),
	);
	await system.encode(
		{
			content: "I actually prefer dark mode now, not light mode",
			role: "user",
		},
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
		{
			content: "I always want TypeScript, never JavaScript",
			role: "user",
			expected: true,
		},
		{
			content: "We decided to use Vitest for all testing",
			role: "user",
			expected: true,
		},
		{ content: "절대 Python 2 쓰지 마세요", role: "user", expected: true },
		{
			content: "This is a critical bug that must be fixed",
			role: "user",
			expected: true,
		},
		{
			content: "I prefer tabs over spaces for indentation",
			role: "user",
			expected: true,
		},
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
		const stored = score.utility >= STORAGE_GATE_THRESHOLD;

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
	const f1 =
		precision + recall > 0
			? (2 * precision * recall) / (precision + recall)
			: 0;

	const target = ADOPTED_CRITERIA.importanceGating.target;
	const minimum = ADOPTED_CRITERIA.importanceGating.minimum;
	const passed =
		precision >= target.precision && recall >= target.recall && f1 >= target.f1;
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
	const adapter = new LocalAdapter(
		join(tmpdir(), `alpha-bench-${randomUUID()}.json`),
	);
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
	const adapter = new LocalAdapter(
		join(tmpdir(), `alpha-bench-${randomUUID()}.json`),
	);
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
	const adapter = new LocalAdapter(
		join(tmpdir(), `alpha-bench-${randomUUID()}.json`),
	);
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
				importance: {
					importance: 0.6,
					surprise: 0.1,
					emotion: 0.5,
					utility: 0.5,
				},
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
	const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
	const result = new Array<number>(arr.length);
	for (let i = 0; i < sorted.length; i++) {
		result[sorted[i].i] = i + 1;
	}
	return result;
}

// ─── Consolidation Recall Impact ────────────────────────────────────────────

async function benchConsolidationRecallImpact(): Promise<BenchmarkResult> {
	const storePath = join(tmpdir(), `naia-bench-consol-${Date.now()}.json`);
	const adapter = new LocalAdapter(storePath);
	const system = new MemorySystem({ adapter });

	// Store episodes with known facts
	const knownFacts = [
		"Kim Haneul prefers dark mode and tab indentation",
		"The company uses PostgreSQL as the primary database",
		"Weekend hobby is running along the Han river",
		"Editor of choice is Neovim with custom config",
		"Cloud provider is GCP with Cloud Run",
	];

	for (const content of knownFacts) {
		await system.encode({ content, role: "user" }, { project: "benchmark" });
	}

	// Close system before manipulating the store file directly
	await system.close();

	// Fast-forward episodes to be old enough for consolidation (>1 hour)
	const { readFileSync, writeFileSync } = await import("node:fs");
	const store = JSON.parse(readFileSync(storePath, "utf-8"));
	for (const ep of store.episodes) {
		ep.timestamp = Date.now() - 2 * HOUR;
	}
	writeFileSync(storePath, JSON.stringify(store));

	// Reload adapter and consolidate
	const adapter2 = new LocalAdapter(storePath);
	const system2 = new MemorySystem({ adapter: adapter2 });
	await system2.consolidateNow();

	// Try to recall each known fact
	let recalled = 0;
	for (const content of knownFacts) {
		const result = await system2.recall(content, { topK: 5 });
		const allContent = [
			...result.facts.map((f) => f.content),
			...result.episodes.map((e) => e.content),
		].join(" ");
		// Check if distinctive terms from the fact appear in recall
		// Require 5+ char terms to avoid false positives on common words
		const keyTerms = content.split(/\s+/).filter((t) => t.length >= 5);
		const matchCount = keyTerms.filter((term) =>
			allContent.toLowerCase().includes(term.toLowerCase()),
		).length;
		// Require at least 2 key terms or 1 if few distinctive terms exist
		const threshold = Math.max(1, Math.min(2, keyTerms.length - 1));
		if (matchCount >= threshold) recalled++;
	}

	await system2.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const rate = recalled / knownFacts.length;
	const target = ALPHA_CRITERIA.consolidationRecallImpact.target;
	const minimum = ALPHA_CRITERIA.consolidationRecallImpact.minimum;

	return {
		criterion: "consolidationRecallImpact",
		category: "alpha-original",
		metric: "recall_rate",
		value: { rate, recalled, total: knownFacts.length },
		target,
		minimum,
		passed: rate >= target,
		grade: grade(rate, target, minimum),
	};
}

// ─── Industry Criteria (LLM-free, keyword-based) ────────────────────────────

/**
 * Load fact-bank.json for industry benchmark tests.
 * Returns facts, updates, and noise messages.
 */
async function loadFactBank(): Promise<{
	facts: Array<{ id: string; statement: string; entities: string[] }>;
	updates: Array<{
		id: string;
		target_fact: string;
		statement: string;
		old_value: string;
		new_value: string;
	}>;
	noise: string[];
}> {
	const { readFileSync } = await import("node:fs");
	const bankPath = join(import.meta.dirname, "fact-bank.json");
	const bank = JSON.parse(readFileSync(bankPath, "utf-8"));
	return {
		facts: bank.facts,
		updates: bank.updates,
		noise: bank.noise_messages,
	};
}

/**
 * Create a MemorySystem with facts encoded, ready for recall testing.
 */
async function setupFactSystem(
	facts: Array<{ statement: string; entities: string[] }>,
): Promise<{ system: MemorySystem; storePath: string }> {
	const storePath = join(tmpdir(), `naia-bench-ind-${Date.now()}.json`);
	const adapter = new LocalAdapter(storePath);
	const system = new MemorySystem({ adapter });

	for (const f of facts) {
		await system.encode(
			{ content: f.statement, role: "user" },
			{ project: "benchmark" },
		);
	}

	return { system, storePath };
}

/**
 * Check if recall results contain any of the expected keywords.
 */
function recallContains(
	result: { episodes: Episode[]; facts: Fact[] },
	keywords: string[],
): boolean {
	const allText = [
		...result.episodes.map((e) => e.content),
		...result.facts.map((f) => f.content),
	]
		.join(" ")
		.toLowerCase();
	return keywords.some((k) => allText.includes(k.toLowerCase()));
}

async function benchSingleHopRetrieval(): Promise<BenchmarkResult> {
	const bank = await loadFactBank();
	const { system, storePath } = await setupFactSystem(bank.facts);

	// Test: direct keyword queries for each fact
	const queries = [
		{ query: "김하늘", keywords: ["김하늘"] },
		{ query: "TypeScript", keywords: ["typescript"] },
		{ query: "Neovim", keywords: ["neovim"] },
		{ query: "성수동", keywords: ["성수동"] },
		{ query: "아메리카노", keywords: ["아메리카노"] },
		{ query: "김바다", keywords: ["김바다"] },
		{ query: "Fedora", keywords: ["fedora"] },
		{ query: "러닝", keywords: ["러닝"] },
		{ query: "PostgreSQL", keywords: ["postgresql"] },
		{ query: "해피해킹", keywords: ["해피해킹"] },
		{ query: "카이스트", keywords: ["카이스트"] },
		{ query: "뭉치", keywords: ["뭉치"] },
		{ query: "INTJ", keywords: ["intj"] },
		{ query: "Vitest", keywords: ["vitest"] },
		{ query: "피아노", keywords: ["피아노"] },
	];

	let passed = 0;
	for (const { query, keywords } of queries) {
		const result = await system.recall(query, { topK: 5 });
		if (recallContains(result, keywords)) passed++;
	}

	await system.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const accuracy = passed / queries.length;
	const target = INDUSTRY_CRITERIA.singleHopRetrieval.target;
	const minimum = INDUSTRY_CRITERIA.singleHopRetrieval.minimum;

	return {
		criterion: "singleHopRetrieval",
		category: "industry",
		metric: "accuracy",
		value: accuracy,
		target,
		minimum,
		passed: accuracy >= target,
		grade: grade(accuracy, target, minimum),
	};
}

async function benchKnowledgeUpdate(): Promise<BenchmarkResult> {
	const bank = await loadFactBank();
	const { system, storePath } = await setupFactSystem(bank.facts);

	// Apply updates
	for (const upd of bank.updates) {
		await system.encode(
			{ content: upd.statement, role: "user" },
			{ project: "benchmark" },
		);
	}

	// Verify updates are reflected
	const checks = bank.updates.map((upd) => ({
		query: upd.new_value,
		keywords: [upd.new_value.toLowerCase()],
	}));

	let passed = 0;
	for (const { query, keywords } of checks) {
		const result = await system.recall(query, { topK: 5 });
		if (recallContains(result, keywords)) passed++;
	}

	await system.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const accuracy = passed / checks.length;
	const target = INDUSTRY_CRITERIA.knowledgeUpdate.target;
	const minimum = INDUSTRY_CRITERIA.knowledgeUpdate.minimum;

	return {
		criterion: "knowledgeUpdate",
		category: "industry",
		metric: "accuracy",
		value: accuracy,
		target,
		minimum,
		passed: accuracy >= target,
		grade: grade(accuracy, target, minimum),
	};
}

async function benchAbstention(): Promise<BenchmarkResult> {
	const bank = await loadFactBank();
	const { system, storePath } = await setupFactSystem(bank.facts);

	// Queries about things never mentioned
	const queries = [
		{ query: "Kubernetes", hallucination: ["kubernetes", "k8s"] },
		{ query: "Spring Boot", hallucination: ["spring"] },
		{ query: "Visual Studio Code", hallucination: ["vscode", "visual studio"] },
		{ query: "수영", hallucination: ["수영"] },
		{ query: "고양이", hallucination: ["고양이"] },
		{ query: "Ruby on Rails", hallucination: ["rails", "ruby"] },
		{ query: "기타 연주", hallucination: ["기타"] },
		{ query: "유튜브 채널", hallucination: ["유튜브", "채널"] },
		{ query: "macOS", hallucination: ["macos", "mac"] },
		{ query: "강남 거주", hallucination: ["강남"] },
	];

	let passed = 0;
	for (const { query, hallucination } of queries) {
		const result = await system.recall(query, { topK: 5 });
		// Abstention = no hallucination keywords found in results
		if (!recallContains(result, hallucination)) passed++;
	}

	await system.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const accuracy = passed / queries.length;
	const target = INDUSTRY_CRITERIA.abstention.target;
	const minimum = INDUSTRY_CRITERIA.abstention.minimum;

	return {
		criterion: "abstention",
		category: "industry",
		metric: "accuracy",
		value: accuracy,
		target,
		minimum,
		passed: accuracy >= target,
		grade: grade(accuracy, target, minimum),
	};
}

async function benchMultiSessionReasoning(): Promise<BenchmarkResult> {
	const storePath = join(tmpdir(), `naia-bench-multi-${Date.now()}.json`);

	// Session 1: Store facts (no contradictions across sessions)
	const adapter1 = new LocalAdapter(storePath);
	const system1 = new MemorySystem({ adapter: adapter1 });
	const session1Facts = [
		"My name is Kim Haneul and I work at an AI startup",
		"I prefer TypeScript and use Neovim as editor",
		"I live in Seongsu-dong and run along the Han river",
	];
	for (const f of session1Facts) {
		await system1.encode({ content: f, role: "user" }, { project: "test" });
	}
	await system1.close();

	// Session 2: Store additional non-conflicting facts
	const adapter2 = new LocalAdapter(storePath);
	const system2 = new MemorySystem({ adapter: adapter2 });
	const session2Facts = [
		"I use PostgreSQL as database and GCP as cloud",
		"I enjoy reading science fiction books",
	];
	for (const f of session2Facts) {
		await system2.encode({ content: f, role: "user" }, { project: "test" });
	}
	await system2.close();

	// Session 3: Cross-session queries — all facts from both sessions
	const adapter3 = new LocalAdapter(storePath);
	const system3 = new MemorySystem({ adapter: adapter3 });

	const queries = [
		{ query: "Neovim", keywords: ["neovim"] },
		{ query: "TypeScript", keywords: ["typescript"] },
		{ query: "Seongsu", keywords: ["seongsu"] },
		{ query: "PostgreSQL", keywords: ["postgresql"] },
		{ query: "science fiction", keywords: ["science fiction", "fiction"] },
	];

	let passed = 0;
	for (const { query, keywords } of queries) {
		const result = await system3.recall(query, { topK: 5 });
		if (recallContains(result, keywords)) passed++;
	}

	await system3.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const accuracy = passed / queries.length;
	const target = INDUSTRY_CRITERIA.multiSessionReasoning.target;
	const minimum = INDUSTRY_CRITERIA.multiSessionReasoning.minimum;

	return {
		criterion: "multiSessionReasoning",
		category: "industry",
		metric: "accuracy",
		value: accuracy,
		target,
		minimum,
		passed: accuracy >= target,
		grade: grade(accuracy, target, minimum),
	};
}

async function benchKnowledgeRetention(): Promise<BenchmarkResult> {
	const storePath = join(tmpdir(), `naia-bench-ret-${Date.now()}.json`);
	const adapter = new LocalAdapter(storePath);
	const system = new MemorySystem({ adapter });

	// Store multiple facts, then have many filler turns, then check retention
	const retentionFacts = [
		{
			content: "I prefer dark mode and tab indentation always",
			query: "dark mode",
			keywords: ["dark mode", "tab"],
		},
		{
			content: "My favorite coffee is Americano only",
			query: "Americano",
			keywords: ["americano"],
		},
		{
			content: "I graduated from KAIST computer science",
			query: "KAIST",
			keywords: ["kaist"],
		},
		{
			content: "I use Fedora as my operating system always",
			query: "Fedora",
			keywords: ["fedora"],
		},
		{
			content: "My hobby is running along the Han river",
			query: "running",
			keywords: ["running", "han river"],
		},
	];

	for (const f of retentionFacts) {
		await system.encode(
			{ content: f.content, role: "user" },
			{ project: "test" },
		);
	}

	// Simulate 10 filler turns (noise)
	const fillers = [
		"Can you help me debug this?",
		"What is the best sorting algorithm?",
		"How does HTTP/2 work?",
		"Explain React hooks to me",
		"What is a binary search tree?",
		"How do I optimize SQL queries?",
		"Tell me about WebSocket protocol",
		"What is the CAP theorem?",
		"How does garbage collection work?",
		"Explain container networking",
	];
	for (const f of fillers) {
		await system.encode({ content: f, role: "user" }, { project: "test" });
	}

	// Check if original facts are still retrievable after many turns
	let retained = 0;
	for (const f of retentionFacts) {
		const result = await system.recall(f.query, { topK: 10 });
		if (recallContains(result, f.keywords)) retained++;
	}

	await system.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const ratio = retained / retentionFacts.length;
	const target = INDUSTRY_CRITERIA.knowledgeRetention.target;
	const minimum = INDUSTRY_CRITERIA.knowledgeRetention.minimum;

	return {
		criterion: "knowledgeRetention",
		category: "industry",
		metric: "ratio",
		value: ratio,
		target,
		minimum,
		passed: ratio >= target,
		grade: grade(ratio, target, minimum),
	};
}

async function benchTemporalReasoning(): Promise<BenchmarkResult> {
	const storePath = join(tmpdir(), `naia-bench-temp-${Date.now()}.json`);
	const adapter = new LocalAdapter(storePath);
	const system = new MemorySystem({ adapter });

	// Store facts with temporal content
	const temporalFacts = [
		"다음 주 목요일에 투자자 미팅이 있어",
		"이번 주 금요일에 팀 회식이야",
		"4월에 베타 런칭 발표회 있어",
		"이번 주 수요일에 치과 예약 있어",
		"토요일에 동생 생일이야",
	];
	for (const f of temporalFacts) {
		await system.encode({ content: f, role: "user" }, { project: "test" });
	}

	// Query temporal facts
	const queries = [
		{ query: "투자자 미팅", keywords: ["투자자", "목요일"] },
		{ query: "회식", keywords: ["회식", "금요일"] },
		{ query: "발표회", keywords: ["발표회", "4월"] },
		{ query: "치과", keywords: ["치과", "수요일"] },
		{ query: "동생 생일", keywords: ["생일", "토요일"] },
	];

	let passed = 0;
	for (const { query, keywords } of queries) {
		const result = await system.recall(query, { topK: 5 });
		if (recallContains(result, keywords)) passed++;
	}

	await system.close();
	try {
		const { rmSync } = await import("node:fs");
		rmSync(storePath);
	} catch {}

	const accuracy = passed / queries.length;
	const target = ADOPTED_CRITERIA.temporalReasoning.target;
	const minimum = ADOPTED_CRITERIA.temporalReasoning.minimum;

	return {
		criterion: "temporalReasoning",
		category: "adopted",
		metric: "accuracy",
		value: accuracy,
		target,
		minimum,
		passed: accuracy >= target,
		grade: grade(accuracy, target, minimum),
	};
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
	results.push(await benchConsolidationRecallImpact());

	// Industry criteria
	results.push(await benchSingleHopRetrieval());
	results.push(await benchKnowledgeUpdate());
	results.push(await benchAbstention());
	results.push(await benchMultiSessionReasoning());
	results.push(await benchKnowledgeRetention());

	// Adopted criteria
	results.push(await benchImportanceGating());
	results.push(await benchTemporalReasoning());

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
