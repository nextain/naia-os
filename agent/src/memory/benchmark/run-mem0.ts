import { randomUUID } from "node:crypto";
/**
 * mem0 benchmark runner — measures performance with mem0 OSS backend.
 * Requires GEMINI_API_KEY environment variable.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("GEMINI_API_KEY required");
		process.exit(1);
	}

	const { Memory } = await import("mem0ai/oss");

	const dbPath = `/tmp/mem0-bench-${randomUUID()}`;
	const m = new Memory({
		embedder: {
			provider: "openai",
			config: {
				apiKey,
				baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
				model: "gemini-embedding-001",
			},
		},
		vectorStore: {
			provider: "memory",
			config: {
				collectionName: "bench",
				dimension: 3072,
				dbPath: `${dbPath}-vec.db`,
			},
		},
		llm: {
			provider: "openai",
			config: {
				apiKey,
				baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
				model: "gemini-2.5-flash",
			},
		},
		historyDbPath: `${dbPath}-hist.db`,
	});

	const TEMPLATES_PATH = join(import.meta.dirname, "query-templates.json");
	const FACTBANK_PATH = join(import.meta.dirname, "fact-bank.json");
	const templates = JSON.parse(readFileSync(TEMPLATES_PATH, "utf-8"));
	const factBank = JSON.parse(readFileSync(FACTBANK_PATH, "utf-8"));

	// Phase 1: Encode facts
	console.log("=== Phase 1: Encoding facts via mem0 ===");
	for (const fact of factBank.facts) {
		try {
			await m.add([{ role: "user", content: fact.statement }], {
				userId: "bench-user",
			});
			console.log(`  ✅ ${fact.id}: ${fact.statement.slice(0, 40)}...`);
		} catch (err: any) {
			console.log(`  ❌ ${fact.id}: ${err.message?.slice(0, 60)}`);
		}
	}

	// Phase 2: Run queries
	console.log("\n=== Phase 2: Running queries ===\n");
	const results: any[] = [];
	let totalPass = 0;
	let totalTests = 0;

	for (const [capName, cap] of Object.entries(templates.capabilities) as [
		string,
		any,
	][]) {
		if (!cap.queries) continue;
		let capPass = 0;
		let capTotal = 0;

		for (const q of cap.queries) {
			const query = q.query || q.verify || "";
			if (!query) continue;

			// Handle updates
			if (q.update) {
				try {
					await m.add([{ role: "user", content: q.update }], {
						userId: "bench-user",
					});
				} catch {}
			}
			if (q.setup) {
				try {
					await m.add([{ role: "user", content: q.setup }], {
						userId: "bench-user",
					});
				} catch {}
			}
			if (q.noisy_input) {
				try {
					await m.add([{ role: "user", content: q.noisy_input }], {
						userId: "bench-user",
					});
				} catch {}
			}

			// Search with threshold filtering
			// Calibrated on separate data (not benchmark queries):
			// Related: 0.59-0.79 (avg 0.67), Unrelated: 0.53-0.65 (avg 0.56)
			// Gap is narrow — threshold alone cannot fully solve abstention.
			// 0.6 is the best compromise: catches most unrelated, keeps most related.
			const SIMILARITY_THRESHOLD = 0.6;
			let searchResults: any[] = [];
			try {
				const raw = await m.search(query, { userId: "bench-user", limit: 5 });
				const rawResults = raw?.results ?? raw ?? [];
				// Filter by similarity score — prevents abstention failures
				searchResults = rawResults.filter(
					(r: any) => (r.score ?? 1) >= SIMILARITY_THRESHOLD,
				);
			} catch {}

			const allContent = searchResults
				.map((r: any) => r.memory ?? r.text ?? "")
				.join(" ")
				.toLowerCase();

			let pass = false;
			let detail = "";

			if (q.expected_contains) {
				const found = q.expected_contains.filter((e: string) =>
					allContent.includes(e.toLowerCase()),
				);
				pass = found.length >= 1;
				detail = `found: [${found.join(", ")}] / expected: [${q.expected_contains.join(", ")}]`;
			} else if (q.expected_any) {
				const minExpected = cap.min_expected || cap.min_facts || 2;
				const found = q.expected_any.filter((e: string) =>
					allContent.includes(e.toLowerCase()),
				);
				pass = found.length >= minExpected;
				detail = `found ${found.length}/${q.expected_any.length} (min: ${minExpected}): [${found.join(", ")}]`;
			} else if (q.expected_pattern) {
				pass = searchResults.length === 0;
				detail = `results: ${searchResults.length} (0 = pass for abstention)`;
			} else if (q.expected_not_contains) {
				const bad = q.expected_not_contains.filter((e: string) =>
					allContent.includes(e.toLowerCase()),
				);
				pass = bad.length === 0;
				detail = `unwanted: [${bad.join(", ")}]`;
			}

			capTotal++;
			if (pass) capPass++;
			totalTests++;
			if (pass) totalPass++;

			const icon = pass ? "✅" : "❌";
			console.log(
				`  ${icon} [${capName}] "${query.slice(0, 40)}..." — ${detail}`,
			);

			results.push({ capability: capName, query, pass, detail });
		}
		console.log(`  → ${capName}: ${capPass}/${capTotal}\n`);
	}

	// Report
	const passRate = Math.round((totalPass / totalTests) * 100);
	console.log("\n=== MEM0 RESULTS ===");
	console.log(`Total: ${totalPass}/${totalTests} (${passRate}%)`);

	const byCapability: any = {};
	for (const r of results) {
		if (!byCapability[r.capability])
			byCapability[r.capability] = { pass: 0, total: 0 };
		byCapability[r.capability].total++;
		if (r.pass) byCapability[r.capability].pass++;
	}
	console.log("\nBy capability:");
	for (const [name, cap] of Object.entries(byCapability) as [string, any][]) {
		console.log(`  ${name}: ${cap.pass}/${cap.total}`);
	}

	const reportDir = join(import.meta.dirname, "../../..", "reports");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(
		reportDir,
		`memory-mem0-${new Date().toISOString().slice(0, 10)}.json`,
	);
	writeFileSync(
		reportPath,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				label: "mem0 OSS (Gemini embeddings + Gemini LLM)",
				total: totalTests,
				passed: totalPass,
				passRate,
				byCapability,
				details: results,
			},
			null,
			2,
		),
	);
	console.log(`\nReport saved: ${reportPath}`);
}

main().catch(console.error);
