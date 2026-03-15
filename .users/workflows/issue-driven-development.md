<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Issue-Driven Development Cycle

> Mirror: `.agents/workflows/issue-driven-development.yaml`

## Purpose

Upstream-first, code-centric development methodology for feature-level work (new features, broad bug fixes). Default workflow for all feature-level development.

For non-feature changes (typos, config values, simple directives), use `development-cycle.yaml`.

---

## 13 Phases

### User-Involved (front-loaded)

| # | Phase | Gate | Description |
|---|-------|------|-------------|
| 1 | **Issue** | — | Create or receive a GitHub Issue |
| 2 | **Understand** | ✓ | Confirm understanding with user |
| 3 | **Scope** | ✓ | Define investigation scope and depth |
| 4 | **Investigate** | — | Code-centric investigation (loop until TWO consecutive clean passes) |
| 5 | **Plan** | ✓ | Draft plan, user approves |

### AI-Autonomous (with quality gates)

| # | Phase | Description |
|---|-------|-------------|
| 6 | **Build** | Implement per plan, one phase at a time |
| 7 | **Review** | Per-phase + full iterative review (2 consecutive clean passes) |
| 8 | **E2E Test** | Run actual app/server, targeted tests first then full suite |
| 9 | **Post-test Review** | Re-review after tests pass (2 consecutive clean passes) |
| 10 | **Sync** | Update context + reflect lessons → user confirmation (gate) |
| 11 | **Sync Verify** | Verify context accuracy (2 consecutive clean passes) |
| 12 | **Report** | Summarize results to user |
| 13 | **Commit** | Commit with Issue reference, create PR |

---

## Key Principles

- **Upstream analysis first**: Read the actual code before designing
- **Minimal modification**: Follow upstream patterns, overlay customizations
- **No guessing**: Never assume — read actual implementation
- **Structural problem first**: When tests fail, check doc-code mismatches before blaming tools
- **Working code preservation**: Never break working code by "improving"

---

## Iterative Review

All review loops terminate after **two consecutive clean passes** (not just one). A single clean pass can be a false negative.

**Applies at 5 points:**
1. After **Plan** — review plan before build
2. After each **Build** phase — per-phase code review + test
3. After all **Build** phases — full code review across all changes
4. After **E2E Test** — post-test full code review
5. After **Sync** — context mirror accuracy verification

---

## Progress File (Session Handoff)

Progress files (`.agents/progress/*.json`) survive context compaction and session boundaries. They allow the next AI session to resume work without losing state.

**Gitignored** — session-local only, not committed.

### When to Update

| Trigger | What to Update |
|---------|---------------|
| Gate approved (understand, scope, plan, sync) | `current_phase`, `gate_approvals.{phase}` |
| Build phase start / sub-phase completion | `current_phase`, `decisions[]` |
| Session end (mandatory) | Snapshot current state |
| Surprise or blocker discovered | Append to `surprises[]` or `blockers[]` |

### Schema

```json
{
  "issue": "#42",
  "title": "Feature description",
  "project": "naia-os",
  "current_phase": "build",
  "gate_approvals": { "understand": "ISO-timestamp", ... },
  "decisions": [{ "decision": "...", "rationale": "...", "date": "..." }],
  "surprises": [],
  "blockers": [],
  "updated_at": "ISO-timestamp"
}
```

Detail: `.agents/context/harness.yaml`

---

## Artifact Storage

| Type | Location | Language |
|------|----------|----------|
| Intermediate (findings, plans) | GitHub Issue comments | English |
| Final (rules, processes) | `.agents/` context files | English |
| Personal notes | `work-logs/{username}/` (gitignored) | Contributor's preferred |

---

## Work-Logs Convention

- **Location**: `work-logs/` (gitignored, project-internal)
- **Convention**: `{username}/YYYYMMDD-NN-topic.md`
- **Language**: Contributor's preferred language
- **Backup**: Optional — `git init` inside `work-logs/` for private backup

---

## Language Principle

| Scope | Language |
|-------|----------|
| Git commits, Issue comments, PR titles | English |
| Work-logs, personal notes | Contributor's preferred |
| AI responses | Contributor's preferred |

---

## Git Integration

### Workspace Isolation

| Mode | When | Command |
|------|------|---------|
| **Worktree** (default) | Concurrent work — multiple issues active simultaneously | `git worktree add ../{project}-issue-{N}-{desc} issue-{N}-{desc}` |
| **Branch only** | Solo work — only one issue at a time | `git checkout -b issue-{N}-{desc}` |

- Branch naming: `issue-{number}-{short-description}`
- Investigation results, scope, plan posted as Issue comments (English)
- PR links back to Issue on completion

---

## Related Files

## E2E Test Details

### On Failure

**Mandatory first step**: DIAGNOSE -- read full test output before any code change.

**Diagnose:**
1. Read FULL test output (error message, stack trace, actual vs expected values)
2. Read relevant test code to confirm assertions are correct
3. Identify root cause: is it implementation, design, or investigation gap?
4. Record diagnosis in progress file (`test_findings` field)

**Then route:**
- Implementation issue --> return to BUILD (with specific diagnosis of what to fix)
- Design issue --> return to PLAN (with specific diagnosis of design flaw)
- Investigation gap --> return to INVESTIGATE (with specific diagnosis of missing knowledge)

**Rules:**
- NEVER return to BUILD without first reading the full test failure output
- NEVER modify test assertions as the first response to a failure
- The diagnosis must identify a specific root cause, not just "test failed"

**Output**: E2E diagnostic complete -- all tests pass with correct assertions (targeted + full suite)

### Review Checklist

Added item for debug logging:
- `debug_logging_sufficient`: Do new code paths have adequate debug logging (async ops, state transitions, external calls, error paths)?

---

## Related Files

- **SoT**: `.agents/workflows/issue-driven-development.yaml`
- **Coding cycle**: `.agents/workflows/development-cycle.yaml`
- **Contributing guide**: `.agents/context/contributing.yaml`
