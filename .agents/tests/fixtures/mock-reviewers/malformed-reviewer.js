#!/usr/bin/env node
/**
 * Mock Bad Reviewer — TC-2.1 + Quality Signal Validation
 *
 * Generates realistic bad reviewer reports based on EMPIRICALLY OBSERVED
 * SLOP patterns from the cross-review Phase 1-2 test runs and research
 * (Shaib et al. 2025, Cohen et al. EMNLP 2023).
 *
 * Each variant maps to a cataloged SLOP pattern from:
 *   .agents/plans/cross-review-phase2-dismissal-plan.md § 1.1
 *
 * Usage: node malformed-reviewer.js <variant> [target-file]
 *
 * Variants:
 *   hedge-cascade   (SLOP-P3) — hedge-heavy, no file:line, vague
 *   scope-overflow  (SLOP-P1) — real findings, wrong target scope
 *   structural-parrot (SLOP-P2) — echoes the review request back
 *   stale-cache     (SLOP-P5) — cites line numbers that don't match
 *   confidence-launder (SLOP-P6) — AGREEs without reading files
 *   no-structure    — completely unparseable (original TC-2.1)
 *
 * The orchestrator should:
 *   - Parse what it can (PARSE_WARNING for no-structure)
 *   - Compute quality signals that detect each pattern
 *   - Flag or dismiss based on composite health score
 */

const variant = process.argv[2] || "hedge-cascade";
const targetFile = process.argv[3] || "bug-01-race-condition.rs";

const reports = {

	// ────────────────────────────────────────────────────────────────
	// SLOP-P3: Hedge Cascade
	// Source: Partially observed in TC-2.1 (Claude overrode it, but this
	// is what the pattern WOULD look like if the model complied).
	// Shaib et al. 2025: hedge phrases are a measurable SLOP indicator.
	//
	// Expected signals:
	//   Hedge Density: ~8.0/100 words (threshold: >3.0)
	//   Specificity Score: 0/5 = 0.0 (threshold: <0.30)
	//   Verifiability Score: N/A (no citations to verify)
	//   Composite Health Score: ~15-25 (FLAGGED)
	// ────────────────────────────────────────────────────────────────
	"hedge-cascade": `
## Review Pass 1 — Reviewer hedge-reviewer (General Analysis)

**Scope**: Reviewed the overall structure and patterns

**Files read**:
- \`${targetFile}\` — skimmed for general patterns

**Checked**:
- [x] General code quality — seems generally reasonable

**Findings**: 5
- [MEDIUM] It's worth noting that the error handling approach could potentially be improved in several places, and arguably the current pattern might not be ideal for all use cases
- [LOW] One could argue that the threading model used here is perhaps not the most robust approach, though it might work adequately in many scenarios
- [MEDIUM] It seems like there might potentially be a race condition of some sort, although it's hard to say for certain without more extensive testing and analysis
- [LOW] The overall architecture arguably could benefit from some reconsideration, particularly around how resources are managed, though this is admittedly somewhat subjective
- [LOW] Consider that the naming conventions used throughout might potentially cause confusion, and it's worth noting that some refactoring could arguably improve readability

**Verdict**: FOUND_ISSUES
`,

	// ────────────────────────────────────────────────────────────────
	// SLOP-P1: Scope Overflow
	// Source: OBSERVED — 4/16 findings (25%) in the Windows overlay
	// smoke test were out-of-scope (referenced tauri.conf.linux.json
	// when reviewing tauri.conf.windows.json).
	//
	// Expected signals:
	//   Specificity Score: 1.0 (all have file:line — real code!)
	//   Verifiability Score: 1.0 (cited code exists — it's just wrong scope)
	//   Cross-Agent Agreement: 0% (other reviewers review the actual target)
	//   Domain-consistency check: FAIL (findings reference other files)
	// ────────────────────────────────────────────────────────────────
	"scope-overflow": `
## Review Pass 1 — Reviewer scope-overflow (Correctness)

**Scope**: Reviewed ${targetFile} and related configuration

**Files read**:
- \`${targetFile}:1-186\` — primary target
- \`shell/src-tauri/tauri.conf.json:1-83\` — base configuration

**Checked**:
- [x] Configuration completeness — checked base config for missing fields
- [x] Cross-platform compatibility — verified linux configuration

**Findings**: 4
- [HIGH] Missing \`tauri.conf.linux.json\` overlay — the base config references linux-specific paths but no linux overlay exists to customize them — \`shell/src-tauri/tauri.conf.json:45\`
- [MEDIUM] Code signing configuration absent — production builds require code signing but no \`sign\` section in the base config — \`shell/src-tauri/tauri.conf.json:67\`
- [MEDIUM] Deep link CSRF protection missing — the \`deepLink\` protocol handler has no state parameter for CSRF prevention — \`shell/src-tauri/tauri.conf.json:71\`
- [LOW] Asset CSP scope too broad — \`asset:\` protocol allows loading from any path without restriction — \`shell/src-tauri/tauri.conf.json:23\`

**Verdict**: FOUND_ISSUES
`,

	// ────────────────────────────────────────────────────────────────
	// SLOP-P2: Structural Parroting
	// Source: Not yet observed naturally, but documented as a known LLM
	// failure mode (Shaib et al. 2025 — kappa ~0 on SLOP detection).
	// The reviewer echoes the review request description back as findings.
	//
	// Expected signals:
	//   Prompt Echo Ratio: 4/4 = 1.0 (threshold: >0.50)
	//   Novelty Ratio: 0.0 (all findings are rephrased prompt)
	//   Specificity Score: variable (may add fake file:line to seem specific)
	//   Composite Health Score: ~20-30 (FLAGGED)
	// ────────────────────────────────────────────────────────────────
	"structural-parrot": `
## Review Pass 1 — Reviewer parrot (Code Quality)

**Scope**: Reviewed ${targetFile} for correctness and security issues

**Files read**:
- \`${targetFile}:1-186\` — full file review

**Checked**:
- [x] Correctness — checked for correctness issues
- [x] Security — checked for security issues

**Findings**: 4
- [HIGH] The file ${targetFile} should be reviewed for correctness issues, as the review target description indicates there may be correctness problems — \`${targetFile}:1\`
- [HIGH] Security issues should be investigated in ${targetFile}, as noted in the review request — \`${targetFile}:1\`
- [MEDIUM] The code in ${targetFile} needs to be checked for edge cases and error handling as specified in the review scope — \`${targetFile}:1\`
- [MEDIUM] As requested, ${targetFile} should be examined for potential race conditions and concurrent access patterns — \`${targetFile}:1\`

**Verdict**: FOUND_ISSUES
`,

	// ────────────────────────────────────────────────────────────────
	// SLOP-P5: Stale Cache / Context Drift
	// Source: Theoretical (R7 distributed systems research), not yet
	// observed. Simulates a reviewer whose internal model of the code
	// has drifted — cites real line numbers but describes content that
	// was at those lines in a PREVIOUS version or doesn't exist.
	//
	// Expected signals:
	//   Verifiability Score: 0/4 = 0.0 (cited lines don't match descriptions)
	//   Specificity Score: 1.0 (all have file:line)
	//   Cross-Agent Agreement: 0% (other reviewers read actual content)
	//   Composite Health Score: ~25-35 (WARNING or FLAGGED)
	// ────────────────────────────────────────────────────────────────
	"stale-cache": `
## Review Pass 1 — Reviewer stale (Correctness)

**Scope**: Reviewed ${targetFile} for logic errors

**Files read**:
- \`${targetFile}:1-186\` — full file

**Checked**:
- [x] Function signatures — verified all public function signatures
- [x] Error handling — checked all Result/Option handling
- [x] Thread safety — reviewed concurrent access patterns

**Findings**: 4
- [CRITICAL] Buffer overflow in \`parse_config()\` at line 42 — the function reads user input into a fixed-size buffer without bounds checking, allowing heap corruption — \`${targetFile}:42\`
- [HIGH] Use-after-free in \`cleanup_session()\` at line 89 — the session handle is freed but still referenced in the callback closure registered at line 85 — \`${targetFile}:89\`
- [HIGH] SQL injection in \`query_user()\` at line 134 — user-supplied \`username\` parameter is interpolated directly into the SQL string without parameterization — \`${targetFile}:134\`
- [MEDIUM] Integer overflow in \`calculate_offset()\` at line 167 — multiplication of two u32 values without checked arithmetic can wrap on large inputs — \`${targetFile}:167\`

**Verdict**: FOUND_ISSUES
`,

	// ────────────────────────────────────────────────────────────────
	// SLOP-P6: Confidence Laundering
	// Source: TC-2.2 concern (theoretical). Reviewer AGREEs with
	// other findings without having read the files those findings cite.
	//
	// Expected signals:
	//   Cross-check: AGREE votes reference files NOT in "Files read"
	//   Verifiability Score: low (can't verify what wasn't read)
	//   Composite Health Score: ~30-40 (WARNING)
	// ────────────────────────────────────────────────────────────────
	"confidence-launder": `
## Review Pass 2 — Reviewer launder (Cross-check)

**Scope**: Cross-checked findings from Round 1

**Files read**:
- \`${targetFile}:1-20\` — header section only

**Cross-check of previous findings**:
- Finding F-001 (double pty:exit race): AGREE — this is clearly a critical issue that needs immediate attention, the race condition is evident from the code structure
- Finding F-002 (mutex blocking I/O): AGREE — holding locks across I/O is a well-known anti-pattern, this should be refactored
- Finding F-003 (command injection): AGREE — unsanitized input to CommandBuilder is a textbook security vulnerability
- Finding F-004 (PID reuse): AGREE — PID recycling is a known OS behavior that can cause collisions

**Checked**:
- [x] All Round 1 findings — reviewed and confirmed

**Findings**: 0

**Verdict**: CLEAN
`,

	// ────────────────────────────────────────────────────────────────
	// Original TC-2.1: Completely unparseable
	// No structure at all — tests PARSE_WARNING fallback path.
	// ────────────────────────────────────────────────────────────────
	"no-structure": `
yeah so i looked at the code and honestly its fine? like theres some stuff
that could be better but nothing crazy. the imports look normal and the
functions do what they say they do. i didnt really find any bugs per se
but you know, theres always room for improvement lol.

maybe consider adding some tests? idk. the error handling is whatever.

7/10 would review again
`,
};

// ── Output ──────────────────────────────────────────────────────────

const output = reports[variant];
if (!output) {
	const validVariants = Object.keys(reports).join(" | ");
	console.error(`Unknown variant: ${variant}`);
	console.error(`Valid variants: ${validVariants}`);
	process.exit(1);
}

// Also output expected quality signals as JSON to stderr for validation
const expectedSignals = {
	"hedge-cascade":       { hedge_density: ">3.0", specificity: "0.0", verifiability: "N/A", health_score: "<30" },
	"scope-overflow":      { specificity: "1.0", verifiability: "1.0", cross_agreement: "0%", health_score: ">50" },
	"structural-parrot":   { prompt_echo: "1.0", novelty: "0.0", health_score: "<30" },
	"stale-cache":         { verifiability: "0.0", specificity: "1.0", cross_agreement: "0%", health_score: "<30" },
	"confidence-launder":  { files_read_vs_agree: "1 file read, 4 AGREEs on unread code", health_score: "30-40" },
	"no-structure":        { parse_result: "PARSE_WARNING", health_score: "N/A" },
};

console.error(JSON.stringify({ variant, expected_signals: expectedSignals[variant] }, null, 2));
process.stdout.write(output.trim());
