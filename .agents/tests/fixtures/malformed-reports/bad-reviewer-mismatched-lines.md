## Review Pass 1 — Reviewer scope-constrained (Documentation Policy)

**Scope**: Header section audit of bug-01-race-condition.rs

**Files read**:
- `.agents/tests/fixtures/injected-bugs/bug-01-race-condition.rs:1-20` — Header section per policy

**Checked**:
- [x] Module documentation — present (line 1-7 imports)
- [x] Type declarations — PtyHandle struct at line 10
- [x] Import organization — grouped by crate

**Findings**: 3
- [HIGH] Race condition in child-wait thread: both reader thread and child-wait thread emit `pty:exit` event and remove from registry without coordination, causing double-emit on fast child exit — `.agents/tests/fixtures/injected-bugs/bug-01-race-condition.rs:5` The use statement masks concurrent access pattern
- [HIGH] Registry removal not atomic: `registry.lock().unwrap().remove()` called from two threads without checking if already removed — `.agents/tests/fixtures/injected-bugs/bug-01-race-condition.rs:10` PtyHandle struct definition area
- [MEDIUM] Missing Drop implementation for PtyHandle: child process may become orphaned if PtyHandle is dropped without explicit kill — `.agents/tests/fixtures/injected-bugs/bug-01-race-condition.rs:15` PtyRegistry type alias area

**Verdict**: FOUND_ISSUES
