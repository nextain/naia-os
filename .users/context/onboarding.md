# Developer Onboarding — Code Philosophy & AI Collaboration

> Mirror: `.users/context/ko/onboarding.md` (Korean)
> This document is for **all contributors** (human and AI) joining the Naia OS project.

---

## 1. Design Principles — Why We Build This Way

Every rule in this project derives from four principles:

| Principle | Meaning | In Practice |
|-----------|---------|-------------|
| **Simple** | No unnecessary complexity. Code explains itself. | Minimal abstraction. No "what" comments — code IS the explanation. |
| **Robust** | Handles edge cases. Fails gracefully. | Tests are **diagnostic tools** that verify robustness — not scoreboards to pass. |
| **Debuggable** | Every failure is diagnosable from the first occurrence. | Debug logging is added **during implementation** (build-time), not after bugs appear. |
| **Extensible** | New features without modifying existing code. | Provider registry pattern. Abstraction serves these 4 principles — it's not a goal in itself. |

**Key rule**: Abstraction is a tool to achieve these principles, not a goal in itself.

---

## 2. Context System — The Project's "Comments"

### Why context files matter

In traditional development, code comments explain "why". In this project, the **context system** (`.agents/` + `.users/`) serves that role at the project level.

- **Code** explains "what" (self-documenting)
- **Context files** explain "why" (design decisions, architecture, philosophy)
- **In-code comments** are minimal — only for non-obvious logic (workarounds, external constraints)

### Structure

```
.agents/                    # AI-optimized (English, YAML/JSON)
├── context/                # Project rules, architecture, testing strategy
│   └── agents-rules.json   # Single Source of Truth ← read every session
├── workflows/              # Development processes
└── progress/               # Session handoff files (gitignored)

.users/                     # Human-readable (Markdown)
├── context/                # English mirror of .agents/context/
│   └── ko/                 # Korean mirror (maintainer language)
└── workflows/              # Mirror of .agents/workflows/
```

**Triple mirror**: `.agents/` (AI) ↔ `.users/context/` (English) ↔ `.users/context/ko/` (Korean). Changes must propagate to all three.

### Context accuracy = Code quality

If context is wrong, every AI session starts with wrong assumptions. Maintaining accurate context is as important as writing correct code.

---

## 3. Testing Philosophy

### Tests are diagnostic tools

Tests exist to **understand system state**, not to produce a green checkmark.

- A failing test = **information about a bug** → read the output, diagnose the root cause
- A passing test with wrong assertions = **worse than a failing test** → it hides bugs

### What NOT to do

| Anti-pattern | Why it's harmful |
|-------------|-----------------|
| Loosening assertions to make tests pass | Hides the actual bug |
| Changing expected values to match buggy output | Encodes bugs as "correct" behavior |
| Deleting/skipping failing tests | Removes the diagnostic signal |
| Reporting "tests pass" without reading what they verified | False confidence |

### Test code review

Test code itself must be iteratively reviewed (TWO consecutive clean passes) before trusting results. Faulty test logic masks real bugs.

---

## 4. Observability — Build-Time Logging

Debug logging is a **build-time activity**, not a debug-time activity.

When writing new code, add logging for:
- Every async operation (start, success, failure)
- Every state transition (before → after)
- Every external call (API, IPC, file I/O)
- Every error handling path

**Why**: If logging is added only after a problem occurs, the first occurrence is always undiagnosed.

**Release builds strip debug logs** — so there's no performance cost. No excuse to skip them.

---

## 5. Development Process

### Feature work (default)

13 phases: Issue → Understand (gate) → Scope (gate) → Investigate → Plan (gate) → Build → Review → E2E Test → Post-test Review → Sync (gate) → Sync Verify → Report → Commit

**Gates** require user confirmation. **Iterative review** means TWO consecutive clean passes, not a single pass.

Detail: `.agents/workflows/issue-driven-development.yaml`

### Simple changes

PLAN → CHECK → BUILD → VERIFY → CLEAN → COMMIT

Detail: `.agents/workflows/development-cycle.yaml`

### E2E test failure response

**Mandatory first step: DIAGNOSE** — before any code change:
1. Read full test output (error, stack trace, actual vs expected)
2. Confirm test assertions are correct
3. Identify root cause (implementation / design / investigation gap)
4. Record diagnosis in progress file

Then route to the appropriate phase with a specific diagnosis.

---

## 6. AI Behavioral Awareness

This project is developed with AI agents. These are known AI tendencies that violate our principles:

| Tendency | What happens | Counter |
|----------|-------------|---------|
| **Optimistic code** | Only happy-path code written | Consciously implement error paths during BUILD |
| **Goal fixation** | Converge on measurable goal (test pass) | Ask: what is the PURPOSE? |
| **Success bias** | Report uncertain as "complete" | If not verified, it is not complete |
| **Front-back inconsistency** | Earlier code contradicts later code | Iterative review catches this |

These aren't criticisms — they're structural characteristics to be aware of and compensate for.

---

## 7. Quick Reference

| What | Where |
|------|-------|
| Project rules (SoT) | `.agents/context/agents-rules.json` |
| Testing strategy | `.agents/context/testing.yaml` |
| Feature workflow | `.agents/workflows/issue-driven-development.yaml` |
| Simple changes workflow | `.agents/workflows/development-cycle.yaml` |
| Harness (hooks, progress) | `.agents/context/harness.yaml` |
| Lessons learned | `.agents/context/lessons-learned.yaml` |
| This document (Korean) | `.users/context/ko/onboarding.md` |
