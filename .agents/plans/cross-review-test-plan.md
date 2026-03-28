# Cross-Review Framework — Test Development Plan

> **Parent**: `.agents/plans/cross-review-implementation-design.md`
> **GitHub Issue**: https://github.com/nextain/naia-os/issues/165
> **Status**: Draft
> **Input**: Adversarial test strategy review (23 test cases identified)

Date: 2026-03-28

---

## 1. Test Philosophy

The framework claims to improve AI review quality through multi-agent cross-checking.
Its own testing must be **at least as rigorous** as what it demands of reviewed artifacts.

Key principles:
- **Characterization over binary pass/fail** — Some tests measure rates, not thresholds
- **Failure mode coverage** — Test what goes WRONG, not just what goes right
- **Baseline comparison** — Multi-reviewer must prove value over single-reviewer
- **False positive rate is as important as detection rate**
- **Non-determinism handling** — Each test runs N=3 times; PASS requires 2/3 consistent results
- **Regression coverage** — P0 tests designated as regression suite, re-run before any framework change

### 1.1 Fixture Location

All test fixtures stored in `.agents/tests/fixtures/`:
```
.agents/tests/fixtures/
├── known-good/          # Files with no known bugs (for FP rate)
├── injected-bugs/       # Files with deliberate bugs (for detection rate)
├── malformed-reports/   # Sample bad reviewer output (for parse testing)
└── README.md            # Fixture documentation + creation instructions
```

---

## 2. Test Matrix (from adversarial review)

### P0 — Must pass before framework is used on any real target (9 tests)

| ID | Name | Category | What it validates |
|---|---|---|---|
| TC-1.1 | Large file stress test (500+ lines) | Scale | Reviewer attention on long files |
| TC-1.2 | Multi-file PR simulation (20 files) | Scale | Cross-file reasoning |
| TC-2.1 | Malformed reviewer report (active injection, see Section 9) | Reviewer failure | Parse error handling |
| TC-2.2 | Hallucinated finding (non-existent code) | Reviewer failure | Evidence-based confirmation |
| TC-2.5 | New finding after convergence | Protocol | Convergence state machine |
| TC-3.1 | Partial fix with regression | Protocol | Finding tracking across rounds |
| TC-3.3 | max_rounds exhausted | Protocol | Failure mode exit path |
| TC-3.6 | BUDGET_EXCEEDED exit path | Protocol | Distinct final state |
| TC-4.1 | False positive rate (10 known-good files) | False positives | FP rate measurement |

### P1 — Must pass before CI/team use (13 tests)

| ID | Name | Category |
|---|---|---|
| TC-1.3 | Analysis document review | Scale |
| TC-1.4 | Subjective correctness (no bugs) | Scale |
| TC-2.3 | Correlated blind spot (characterization) | Reviewer failure |
| TC-2.4 | Low-quality reviewer Tier 1 detection | Reviewer failure |
| TC-3.2 | Minimum R=2 | Protocol |
| TC-3.4 | Empty target file | Protocol |
| TC-3.7 | Reviewer timeout / minimum quorum | Protocol |
| TC-4.2 | Unfalsifiable consensus (all wrong) | False positives |
| TC-4.3 | Reviewer dismisses real bug | False positives |
| TC-5.2 | JSONL log integrity | Integration |
| TC-5.3 | Invalid profile loading | Integration |
| TC-5.5 | Profile inheritance (extends) | Integration |
| TC-6.1 | Single-reviewer baseline comparison | Baseline |

### P2 — Before public release (4 tests)

| ID | Name | Category |
|---|---|---|
| TC-3.5 | Binary/non-text target | Protocol |
| TC-5.1 | Skill tool registration | Integration |
| TC-5.4 | Concurrent sessions | Integration |
| TC-6.2 | Token cost per finding | Baseline |

---

## 3. Implementation Approach

Tests are NOT unit tests or automated scripts. They are **structured cross-review invocations**
with controlled inputs and measured outputs. The framework tests itself.

### 3.1 Test Execution Method

Each test is a `/cross-review` invocation with a prepared target:

```
/cross-review code-review "TC-1.1: Review shell/src-tauri/src/lib.rs for correctness"
```

Results are:
1. Captured in JSONL event log
2. Compared against expected outcome
3. Recorded in test results document

### 3.2 Test Fixture Preparation

| Fixture Type | How to prepare | Used by |
|---|---|---|
| **Known-good files** | Select from well-tested open-source code (existing naia-os files that passed prior review) | TC-4.1, TC-1.4 |
| **Injected bugs** | Copy a clean file, introduce a specific known bug at a specific line | TC-1.1, TC-1.2, TC-2.3, TC-4.3, TC-6.1 |
| **Malformed reports** | Active injection via degraded prompt (see Section 9) | TC-2.1 |
| **Hallucinated findings** | Will occur naturally — detect via Tier 1 verifiability check | TC-2.2 |
| **Mock reviewers** | Not directly possible (Agent tool spawns real agents) — simulate by modifying prompts | TC-2.4 |

### 3.3 Measurement Infrastructure

For characterization tests (TC-2.3, TC-4.1, TC-4.2, TC-6.1, TC-6.2):

```
Test run → JSONL log → Parse script → Metrics:
- Detection rate: confirmed_true_positives / total_injected_bugs
- False positive rate: confirmed_false_positives / total_confirmed_findings
- Cost: total tokens consumed (estimated from agent response lengths)
- Convergence rounds: rounds to reach clean_count=2
```

Parse script: a simple bash/node script that reads `.agents/reviews/*.jsonl` and computes metrics.

---

## 4. Phased Execution Plan

### Phase A: Protocol Tests (P0, no fixtures needed)

These test the framework mechanics without needing prepared code:

1. **TC-2.1** (Malformed report): Use active injection method (Section 9)
2. **TC-2.5** (New finding after convergence): Run on any target, observe if framework
   correctly handles a reviewer introducing new findings in late rounds
3. **TC-3.1** (Partial fix + regression): Run Round 1 on a file with 3 issues, fix 2,
   introduce 1 new, run Round 2
4. **TC-3.3** (max_rounds): Set max_rounds=2, run on a target that always produces findings
5. **TC-3.6** (BUDGET_EXCEEDED): Test advisory budget flag in output

**Estimated effort**: 5 tests × 3 runs = 15 runs, ~2 hours
**Deliverable**: Protocol test results + any SKILL.md fixes discovered

### Phase B: Scale Tests (P0)

4. **TC-1.1** (Large file): Run cross-review on `shell/src-tauri/src/lib.rs` (~2600 lines)
5. **TC-1.2** (Multi-file): Run cross-review on "all Rust files changed for Windows porting"

**Estimated effort**: 2 cross-review sessions, ~1 hour
**Deliverable**: Scale test results + attention degradation data

### Phase C: False Positive Baseline (P0)

6. **TC-4.1** (10 known-good files): Select 10 files that have no known bugs.
   Run cross-review on each. Measure FP rate.
7. **TC-2.2** (Hallucination): During TC-4.1, monitor for findings that cite
   non-existent code — natural hallucination detection

**Estimated effort**: 10 cross-review sessions (parallelizable), ~3 hours
**Deliverable**: False positive rate number + hallucination examples

### Phase D: Failure Mode Characterization (P0)

8. **TC-2.3** (Correlated blind spot, P1 characterization): Inject 5 subtle bugs across
   different files. Run cross-review. Measure detection rate. No pass/fail — measurement only.

**Estimated effort**: 5 cross-review sessions, ~2 hours
**Deliverable**: Detection rate number + blind spot examples + parse failure rate

### Phase E: Comparison Baseline (P1)

10. **TC-6.1** (Single vs multi): Take the 5 injected-bug files from Phase D.
    Run each with single reviewer (correctness only). Compare detection rates.

**Estimated effort**: 5 single-reviewer runs + comparison, ~1 hour
**Deliverable**: Multi-reviewer value quantification

### Phase F: P1 Protocol + Integration Tests

9. **TC-2.4** (Low-quality reviewer Tier 1 detection): Use degraded prompt, verify quality signals flag
10. **TC-3.2** (R=2), **TC-3.4** (empty file), **TC-3.7** (timeout/quorum)
11. **TC-5.2** (JSONL log integrity), **TC-5.3** (invalid profile), **TC-5.5** (profile inheritance)
12. **TC-1.3** (analysis doc), **TC-1.4** (subjective target)
13. **TC-4.2** (unfalsifiable consensus), **TC-4.3** (dismissed real bug)

**Estimated effort**: 11 tests, ~3 hours
**Deliverable**: P1 test results

---

## 5. Success Criteria

| Metric | Target | Measured In |
|---|---|---|
| **Detection rate** (injected bugs) | >= 60% | Phase D |
| **False positive rate** (known-good) | <= 20% | Phase C |
| **Multi vs single improvement** | >= +15% detection | Phase E |
| **Parse failure rate** | <= 10% of reviewer reports | All phases |
| **Natural convergence rate** | >= 90% on known-good targets (no user intervention) | Phase C |
| **Protocol correctness** | All P0 protocol tests pass (2/3 runs consistent) | Phase A |
| **Correlated blind spot rate** | Measured (characterization, no pass/fail threshold) | Phase D |

NOTE: "Natural convergence" means the framework reaches clean_count=2 without the user
fixing anything. Targets with injected bugs are expected to NOT converge without fixes —
that is correct behavior. Convergence is measured only on known-good targets.

These targets are based on:
- c-CRAB benchmark all-tools pass rate: 41.5% (our 60% target is above this)
- MULTIVER multi-agent precision: 48.8% (our 80% = 1-20% FP target is above this)
- R2 research finding: multi-agent adds ~15% detection over single agent

---

## 6. Test Results Documentation

Each test produces:

```markdown
## TC-{id}: {name}

**Date**: {ISO}
**Review ID**: {cr-id}
**Target**: {file or description}
**Profile**: {profile used}

**Setup**: {how the test was prepared}
**Expected**: {what should happen}
**Actual**: {what happened}
**Result**: PASS | FAIL | CHARACTERIZATION({value})

**Evidence**: `.agents/reviews/{cr-id}.jsonl`
**Notes**: {observations}
```

All results collected in: `docs/reports/cross-review-test-results.md`

---

## 7. Three Most Dangerous Gaps (from adversarial review)

These require special attention during testing:

1. **Hallucinated findings + unfalsifiable consensus** (TC-2.2 + TC-4.2):
   The confirmation mechanism assumes agreement = correctness. If reviewers share biases,
   they can confirm fabricated findings with high confidence. Monitor for "agreement laundering"
   where a reviewer cannot verify a finding but agrees anyway.

2. **Correlated blind spots** (TC-2.3): A CLEAN result is indistinguishable from
   "all reviewers have the same blind spot." Test measures the rate; documentation must
   communicate the distinction.

3. **max_rounds exhaustion UX** (TC-3.3): Must produce machine-readable exit status,
   not just prose. Downstream consumers must distinguish CLEAN from MAX_ROUNDS_HIT.

---

## 8. Regression Test Suite

The following P0 tests are designated as **regression tests** — re-run before any SKILL.md
or profile change:

| Test | What it guards |
|------|---------------|
| TC-1.1 | Scale (reviewer attention on long files) |
| TC-2.5 | Convergence state machine (backward transitions) |
| TC-3.1 | Finding tracking across rounds (partial fix) |
| TC-3.3 | max_rounds exit path |
| TC-4.1 (3 of 10 files) | False positive rate baseline |

Regression suite can run in ~3 hours (4 tests × 3 runs + TC-4.1 3 files × 3 runs = 21 runs × ~8 min).

## 9. TC-2.1 Active Injection Method

TC-2.1 (Malformed reviewer report) cannot rely on passive observation. Active method:

1. Create a custom reviewer prompt in `.agents/tests/fixtures/malformed-reports/bad-reviewer.md`
   that instructs the reviewer to produce output WITHOUT the required format sections
   (no `**Verdict**:`, no `**Findings**:` header, free-form prose only)
2. Create a temporary profile that uses this malformed prompt for one reviewer
3. Run cross-review with this profile
4. Verify: framework logs PARSE_WARNING, treats the malformed report as CLEAN with 0 findings,
   round continues with remaining 2 reviewers

This is the only way to reliably trigger the PARSE_WARNING fallback path.

## 10. Open Questions

1. **Metrics script**: Build a JSONL parser or rely on manual counting? Recommend: simple node script.
2. **Cost tracking**: Estimate from response length (chars/4 ≈ tokens). Rough but sufficient.
3. **Test schedule**: Spread across sessions to avoid rate limits. Phase A+B in session 1, C+D in session 2, E+F in session 3.
