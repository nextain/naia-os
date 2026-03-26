/**
 * Baseline benchmark runner — runs query-templates.json against current LocalAdapter.
 * Records results as JSON for before/after comparison.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalAdapter } from "../local-adapter.js";
import { MemorySystem } from "../index.js";
import type { Fact } from "../types.js";

const BENCHMARK_DIR = join(import.meta.dirname, "../../..", "reports");
const TEMPLATES_PATH = join(import.meta.dirname, "query-templates.json");
const FACTBANK_PATH = join(import.meta.dirname, "fact-bank.json");

interface QueryResult {
	capability: string;
	query: string;
	response_keywords: string[];
	expected: string[];
	pass: boolean;
	detail: string;
}

async function main() {
	// Load test data
	const templates = JSON.parse(readFileSync(TEMPLATES_PATH, "utf-8"));
	const factBank = JSON.parse(readFileSync(FACTBANK_PATH, "utf-8"));

	// Create a fresh memory system with LocalAdapter
	const storePath = `/tmp/naia-baseline-${randomUUID()}.json`;
	const adapter = new LocalAdapter(storePath);
	const system = new MemorySystem({ adapter });

	const results: QueryResult[] = [];
	let totalPass = 0;
	let totalTests = 0;

	// === Phase 1: Encode all facts ===
	console.log("=== Phase 1: Encoding facts ===");
	for (const fact of factBank.facts) {
		await system.encode(
			{ content: fact.statement, role: "user" },
			{ project: "benchmark" },
		);
		console.log(`  Encoded: ${fact.id} — ${fact.statement.slice(0, 40)}...`);
	}

	// Force consolidation so facts are extracted
	console.log("  Running consolidation...");
	// Hack: backdate episodes so consolidation processes them
	const store = JSON.parse(readFileSync(storePath, "utf-8"));
	for (const ep of store.episodes) {
		ep.timestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
	}
	writeFileSync(storePath, JSON.stringify(store));
	// Reload adapter
	const adapter2 = new LocalAdapter(storePath);
	const system2 = new MemorySystem({ adapter: adapter2 });
	await system2.consolidateNow();

	// === Phase 2: Run queries per capability ===
	console.log("\n=== Phase 2: Running queries ===\n");

	for (const [capName, cap] of Object.entries(templates.capabilities) as [string, any][]) {
		if (!cap.queries) continue;

		let capPass = 0;
		let capTotal = 0;

		for (const q of cap.queries) {
			const query = q.query || q.verify || "";
			if (!query) continue;

			// For noise resilience, encode the noisy input first
			if (q.noisy_input) {
				await system2.encode(
					{ content: q.noisy_input, role: "user" },
					{ project: "benchmark" },
				);
				// Force consolidation again
				const s = JSON.parse(readFileSync(storePath, "utf-8"));
				for (const ep of s.episodes) {
					if (!ep.consolidated) ep.timestamp = Date.now() - 2 * 60 * 60 * 1000;
				}
				writeFileSync(storePath, JSON.stringify(s));
				const a = new LocalAdapter(storePath);
				const sys = new MemorySystem({ adapter: a });
				await sys.consolidateNow();
				await sys.close();
			}

			// For contradiction tests, encode the update first
			if (q.update) {
				await system2.encode(
					{ content: q.update, role: "user" },
					{ project: "benchmark" },
				);
			}

			// For entity disambiguation, encode the setup
			if (q.setup) {
				await system2.encode(
					{ content: q.setup, role: "user" },
					{ project: "benchmark" },
				);
			}

			// Recall
			const result = await system2.recall(query, { topK: 5 });
			const allContent = [
				...result.episodes.map((e) => e.content),
				...result.facts.map((f) => f.content),
			].join(" ").toLowerCase();

			// Evaluate
			let pass = false;
			let detail = "";

			if (q.expected_contains) {
				const found = q.expected_contains.filter((e: string) =>
					allContent.includes(e.toLowerCase()),
				);
				pass = found.length >= (q.expected_contains.length > 1 ? 1 : 1);
				detail = `found: [${found.join(", ")}] / expected: [${q.expected_contains.join(", ")}]`;
			} else if (q.expected_any) {
				const minExpected = cap.min_expected || cap.min_facts || 2;
				const found = q.expected_any.filter((e: string) =>
					allContent.includes(e.toLowerCase()),
				);
				pass = found.length >= minExpected;
				detail = `found ${found.length}/${q.expected_any.length} (min: ${minExpected}): [${found.join(", ")}]`;
			} else if (q.expected_pattern) {
				// Abstention: check that response does NOT contain hallucination, and has refusal pattern
				// Since we're testing recall (not LLM response), abstention = no relevant results
				pass = result.episodes.length === 0 && result.facts.length === 0;
				detail = `episodes: ${result.episodes.length}, facts: ${result.facts.length} (0/0 = pass for abstention)`;
			} else if (q.expected_not_contains) {
				const bad = q.expected_not_contains.filter((e: string) =>
					allContent.includes(e.toLowerCase()),
				);
				pass = bad.length === 0;
				detail = `unwanted found: [${bad.join(", ")}]`;
			}

			results.push({
				capability: capName,
				query,
				response_keywords: allContent.split(" ").slice(0, 20),
				expected: q.expected_contains || q.expected_any || [q.expected_pattern || ""],
				pass,
				detail,
			});

			capTotal++;
			if (pass) capPass++;

			const icon = pass ? "✅" : "❌";
			console.log(`  ${icon} [${capName}] "${query.slice(0, 40)}..." — ${detail}`);
		}

		console.log(`  → ${capName}: ${capPass}/${capTotal}\n`);
		totalPass += capPass;
		totalTests += capTotal;
	}

	// === Phase 3: Report ===
	const report = {
		timestamp: new Date().toISOString(),
		label: "baseline (LocalAdapter, keyword matching)",
		total: totalTests,
		passed: totalPass,
		passRate: Math.round((totalPass / totalTests) * 100),
		byCapability: {} as Record<string, { pass: number; total: number; rate: string }>,
		details: results,
	};

	// Aggregate by capability
	for (const r of results) {
		if (!report.byCapability[r.capability]) {
			report.byCapability[r.capability] = { pass: 0, total: 0, rate: "" };
		}
		report.byCapability[r.capability].total++;
		if (r.pass) report.byCapability[r.capability].pass++;
	}
	for (const cap of Object.values(report.byCapability)) {
		cap.rate = `${cap.pass}/${cap.total}`;
	}

	console.log("\n=== BASELINE RESULTS ===");
	console.log(`Total: ${totalPass}/${totalTests} (${report.passRate}%)`);
	console.log("\nBy capability:");
	for (const [name, cap] of Object.entries(report.byCapability)) {
		console.log(`  ${name}: ${cap.rate}`);
	}

	// Save report
	mkdirSync(BENCHMARK_DIR, { recursive: true });
	const reportPath = join(BENCHMARK_DIR, `memory-baseline-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify(report, null, 2));
	console.log(`\nReport saved: ${reportPath}`);

	await system2.close();
	await system.close();
}

main().catch(console.error);
