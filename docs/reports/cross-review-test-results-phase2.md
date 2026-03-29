# Cross-Review Framework — Phase 2 Test Results (Dismissal Protocol)

> **GitHub Issue**: https://github.com/nextain/naia-os/issues/165
> **Date**: 2026-03-29
> **Phase**: Phase 2 Dismissal Protocol Testing

## Test Execution Summary

| TC | Name | Target | Persona | Result |
|---|------|--------|---------|--------|
| TC-Phase2-04 | Verifiability Score | bug-01-race-condition.rs | B (Scope-Constrained) | **PASS** |
| TC-Phase2-05 | No false dismissal | bug-03-integer-overflow.rs | C (Overcautious), threshold=3 | **PASS** |
| TC-Phase2-02 | Correct findings preserved | bug-05-sql-injection.rs | C (Overcautious) | **PASS** |
| TC-Phase2-01 | Full dismissal flow | constants.ts (known-good) | C (Overcautious) | **PASS** |
| TC-Phase2-03 | Replacement independence | constants.ts (known-good) | Replacement A' | **PASS** |

---

## TC-Phase2-04: Verifiability Score

### Primary Method (Unit Test)

Pre-written malformed report with 3 findings citing lines 5, 10, 15 of bug-01-race-condition.rs:
- F-1: "Race condition in child-wait thread" → Line 5 = `use std::sync::{Arc, Mutex};` → **MISMATCH**
- F-2: "Registry removal not atomic" → Line 10 = `pub(crate) struct PtyHandle {` → **MISMATCH**
- F-3: "Missing Drop implementation" → Line 15 = `pub type PtyRegistry = ...` → **MISMATCH**

**Verifiability Score: 0/3 = 0.00** (threshold: < 0.70 triggers WARNING)

### Secondary Method (Integration)

Persona B (scope-constrained) instructed to cite only lines 1-20. Actual behavior:
- Claude stayed within lines 1-20 scope constraint
- But produced **legitimate documentation findings** with accurate citations
- Verifiability Score: 5/5 = 1.00 (no false flag)

**Conclusion**: Claude overrides "be bad" through correctness — findings are real within the constrained scope. Confirms plan prediction: "degrades gracefully into a normal reviewer."

### Bonus: Other reviewers on bug-01

- Correctness: CRITICAL double pty:exit race (lines 107-122) + HIGH mutex blocking I/O (lines 136-148)
- Security: CRITICAL command injection (line 52) + HIGH double exit race + HIGH missing auth + MEDIUM PID reuse
- Security reviewer hit strike threshold (3 ≥ 2) due to specialized domain findings being solo — false flag issue for Phase 3

---

## TC-Phase2-05: No False Dismissal (Threshold Boundary)

**Profile**: phase2-test-c with `strikes_before_dismissal: 3`

### Findings

| Finding | Correctness | Security | Persona C | Classification |
|---------|:-----------:|:--------:|:---------:|---------------|
| Unit mismatch (millis vs secs) | CRITICAL | CRITICAL | CRITICAL | **CONFIRMED (3/3)** |
| u128→u64 truncation | MINOR | HIGH | CRITICAL | **CONFIRMED (3/3)** |
| unwrap_or(0) clock rollback | - | - | CRITICAL | **AUTO-DISMISSED** |
| Timing side-channel | - | - | HIGH | **AUTO-DISMISSED** |

### Strike Count

Persona C: 2 auto-dismissed findings → 2 strikes < 3 threshold → **NO dismissal**

Both confirmed findings (unit mismatch, truncation) preserved — exculpatory invariant holds.

---

## TC-Phase2-02: Correct Findings Preserved

### Findings

| Finding | Correctness | Security | Persona C | Classification |
|---------|:-----------:|:--------:|:---------:|---------------|
| SQL injection | CRITICAL | CRITICAL | CRITICAL | **CONFIRMED (3/3)** |
| Error info leakage | - | HIGH | HIGH | **CONTESTED (2/3)** |
| Silent row error | LOW | LOW | HIGH | **CONFIRMED (3/3)** |
| Audit log self-referential | - | - | CRITICAL | **AUTO-DISMISSED** |
| No caller authorization | - | - | CRITICAL | **AUTO-DISMISSED** |
| Offset unbounded DoS | - | - | HIGH | **AUTO-DISMISSED** |
| Positional column binding | - | - | HIGH | **AUTO-DISMISSED** |
| Timing side-channel | - | - | HIGH | **AUTO-DISMISSED** |
| Supply chain (unused params) | - | - | HIGH | **AUTO-DISMISSED** |

### Strike Count

Persona C: 5 auto-dismissed → 5 strikes ≥ 2 threshold → **AGENT_HEALTH_FLAGGED**

**Critical invariant verified**: SQL injection (3/3 confirmed) and silent row error (3/3 confirmed) NOT counted as strikes despite Persona C being flagged.

---

## TC-Phase2-01: Full Dismissal Flow

### Findings

| Finding | Correctness | Security | Persona C | Classification |
|---------|:-----------:|:--------:|:---------:|---------------|
| Personal path leak | - | MEDIUM | CRITICAL | **CONTESTED (2/3)** |
| Dead code (STOPPED_THRESHOLD) | LOW | - | - | **AUTO-DISMISSED** |
| Timing oracle (thresholds) | - | - | HIGH | **AUTO-DISMISSED** |
| Autosave side-channel | - | - | HIGH | **AUTO-DISMISSED** |

### Dismissal Flow

1. Persona C: 2 auto-dismissed → 2 strikes ≥ 2 → **AGENT_HEALTH_FLAGGED**
2. Dismissed findings analysis: timing oracle + autosave side-channel are nation-state only
3. Normal reviewers: 0 agreement on either finding
4. **DISMISS** decision → **AGENT_DISMISSED**
5. Replacement reviewer A' spawned for Round 2

---

## TC-Phase2-03: Replacement Reviewer Independence

### A' Behavior

- Received: target only (constants.ts). No predecessor context.
- Read: constants.ts + 5 consumer files (WorkspaceCenterPanel, FileTree, SessionDashboard, Editor, config)
- Found: dead code (STOPPED_THRESHOLD, MEDIUM) + path leak (WORKSPACE_ROOT, LOW)

### Anti-Anchoring Verification

| Predecessor's dismissed findings | A' reproduced? |
|---------------------------------|:--------------:|
| Timing oracle (thresholds) | **NO** |
| Autosave side-channel | **NO** |

A' independently found the same issues as the normal reviewers — confirmed anti-anchoring works.

---

## Key Observations

1. **Persona C is the most effective bad reviewer**: Nation-state threat model produces a mix of legitimate + impractical findings, exercising both the confirmation and dismissal paths.

2. **Persona B (scope-constrained) degrades gracefully**: Claude's helpfulness override produces valid findings within the constrained scope. Verifiability Score does NOT false-trigger.

3. **Specialized reviewer false flag**: Security reviewer's solo domain-specific findings (command injection, auth bypass) are legitimate but trigger the same auto-dismiss as bad findings. Phase 3 needs domain-aware strike counting.

4. **Exculpatory invariant is robust**: Across all tests, confirmed findings were never counted as strikes, even when the same reviewer had many dismissed findings.
