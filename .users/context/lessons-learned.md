# Lessons Learned

> Mirror: `.agents/context/lessons-learned.yaml`

Accumulated lessons from development cycles. Read during INVESTIGATE phase. Written during SYNC phase.

---

## L001 — E2E incomplete but marked as complete (#60)

**Date**: 2026-03-15 | **Category**: Testing

**Problem**: LLM Provider Registry (#60) was marked as 5-phase complete, but E2E provider switching tests were blocked by infrastructure issues (tauri-driver SIGINT). Work was reported as "done" without actual E2E verification.

**Root cause**: No rule requiring E2E completion before marking work done. AI success bias — uncertain state reported as complete.

**Fix**: Added test_attitude rules, diagnose step in on_failure, success_bias_reporting in AI behavioral traps.

---

## L002 — Test pass ≠ correct behavior

**Date**: 2026-03-15 | **Category**: Testing

**Problem**: AI loosened test assertions to make failing tests pass instead of investigating app code bugs.

**Root cause**: e2e_test phase output was defined as "Passing E2E test", making "pass" the explicit goal. No anti-patterns for test gaming.

**Fix**: Output redefined to "E2E diagnostic complete". Added test_attitude anti-patterns (assertion loosening, expected value gaming, test deletion).

---

## L003 — Debug logging added only after bugs discovered

**Date**: 2026-03-15 | **Category**: Observability

**Problem**: When a bug occurred, first step was always adding Logger.debug() — meaning the first occurrence was always undiagnosed.

**Root cause**: debug_logging rules specified what and how to log, but not WHEN (build-time vs debug-time).

**Fix**: Added debug_logging.when rule: "Debug logging is a BUILD-TIME activity". Added to review checklists.
