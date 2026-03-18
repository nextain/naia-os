<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Harness Engineering

> SoT: `.agents/context/harness.yaml`

Mechanical enforcement of project rules via Claude Code hooks.
Concept: "Engineer the environment so the AI never repeats a mistake."

## Overview

Text-based rules (CLAUDE.md, agents-rules.json) get forgotten during long sessions or context compaction. Harness engineering adds **mechanical enforcement** — hooks that intercept tool calls in real-time and physically prevent or warn about rule violations.

Three pillars:

| Pillar | Purpose | Location |
|--------|---------|----------|
| **Hooks** | Intercept edits/commands in real-time | `.claude/hooks/` |
| **Progress Files** | Session handoff across context boundaries | `.agents/progress/` |
| **Tests** | Verify all hooks behave correctly | `.agents/tests/harness/` |

---

## Claude Code Hooks

Registered in `.claude/settings.json`. All hooks use the PostToolUse event.

### Hook Protocol

- **Input**: stdin JSON — `{ tool_name, tool_input, cwd, session_id }`
- **Output**: stdout JSON — `{ reason, hookSpecificOutput: { hookEventName, additionalContext } }`
- Hooks can inject context (advisory) or block tool execution (PreToolUse only)

### sync-entry-points.js

| | |
|---|---|
| **Trigger** | PostToolUse on Edit\|Write |
| **Purpose** | Auto-sync CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md |
| **Behavior** | Copies edited entry point to the other two (if they exist) |
| **Enforces** | Cascade rule — entry point files must always be identical |

- Uses temp lockfile to prevent recursive sync loops
- Only syncs to files that already exist (won't create GEMINI.md if absent)

### cascade-check.js

| | |
|---|---|
| **Trigger** | PostToolUse on Edit\|Write |
| **Purpose** | Remind agent about triple-mirror updates |
| **Behavior** | Advisory reminder (not blocking) |

Detection patterns:
- `.agents/context/*.yaml|json` → remind `.users/context/` + `.users/context/ko/`
- `.users/context/*.md` (not `ko/`) → remind `.agents/` + `.users/context/ko/`
- `.users/context/ko/*.md` → remind `.agents/` + `.users/context/`
- `agents-rules.json` → extra SoT warning

### process-guard.js

| | |
|---|---|
| **Trigger** | Stop (AI response end) |
| **Purpose** | Detect "declaration without action" — review-completion claims without actual file reads |
| **Behavior** | Reads last 128KB of transcript JSONL; if last assistant message contains a review-pass keyword but made no Read/Grep/Glob calls → `decision: "block"` |
| **Enforces** | Iterative review rule — each pass must actually read files, two consecutive clean passes required |

Detection keywords: `수정 없음`, `변경 없음`, `클린 패스`, `clean pass`, `no changes found`, `found no issues`, `이상 없음`, etc.

Inspired by the [open-swe `ensure_no_empty_msg` pattern](https://github.com/langchain-ai/open-swe).

### commit-guard.js

| | |
|---|---|
| **Trigger** | PostToolUse on Bash (git commit commands) |
| **Purpose** | Warn when committing before E2E test and context sync; remind about Lore trailers |
| **Behavior** | Reads progress file — (1) warns if phase < sync_verify, (2) reminds to add Rejected: trailer if rejected_alternatives are recorded, (3) reminds to add Constraint: trailer if constraints_discovered are recorded |

Phase order (must reach `sync_verify` before commit):
```
issue → understand → scope → investigate → plan →
build → review → e2e_test → post_test_review →
sync → sync_verify → report → commit
```

Gracefully passes if no progress file exists (non-feature work).

---

## Progress Files

**Location**: `.agents/progress/*.json` (gitignored — session-local only)

Purpose: Session handoff. When a session ends or context is compacted, the next AI session can read this file to understand current state.

### Schema

| Field | Description |
|-------|-------------|
| `issue` | GitHub Issue reference (e.g., `#42`) |
| `title` | Short description of the work |
| `project` | Project name (e.g., `naia-os`) |
| `current_phase` | Current phase from phase order |
| `gate_approvals` | Map of gate -> ISO timestamp when user approved |
| `decisions` | Array of key decisions (decision, rationale, date) |
| `rejected_alternatives` | **(T2)** Approaches considered but rejected (approach, reason, date) — record during investigate/plan |
| `constraints_discovered` | **(T2)** Technical constraints that shaped decisions (constraint, scope, date) — record during investigate/build |
| `surprises` | Unexpected findings during investigation/build |
| `blockers` | Current blockers preventing progress |
| `test_findings` | Diagnostic results from test failures — mandatory before returning from e2e_test to build/plan. Fields: test_name, error_summary, root_cause, routing |
| `review_evidence` | **(T3 anti-cheat)** Proof that iterative review actually happened. Fields: pass, files_read[], issues_found[], date. Two passes with empty issues_found = review complete. Use `/review` skill. |
| `updated_at` | ISO timestamp of last update |

### Example

```json
{
  "issue": "#42",
  "title": "Add avatar idle animation",
  "project": "naia-os",
  "current_phase": "build",
  "gate_approvals": {
    "understand": "2026-03-14T10:00Z",
    "scope": "2026-03-14T10:15Z",
    "plan": "2026-03-14T11:00Z"
  },
  "decisions": [
    {
      "decision": "Use Three.js AnimationMixer for idle",
      "rationale": "Upstream VRM uses it, minimal custom code",
      "date": "2026-03-14"
    }
  ],
  "rejected_alternatives": [
    {
      "approach": "AudioContext({sampleRate:16000})",
      "reason": "WebKitGTK freezes audio to zeros",
      "date": "2026-03-17"
    }
  ],
  "constraints_discovered": [
    {
      "constraint": "WebKitGTK AudioContext — default sampleRate only",
      "scope": "shell/src/audio/*",
      "date": "2026-03-17"
    }
  ],
  "surprises": [],
  "blockers": [],
  "test_findings": [
    {
      "test_name": "03-basic-chat.spec.ts",
      "error_summary": "Expected non-empty response, got empty string",
      "root_cause": "Gateway connection timeout — agent not spawned",
      "routing": "implementation_issue → BUILD"
    }
  ],
  "updated_at": "2026-03-14T14:30Z"
}
```

### When to Update

1. Gate approval (understand, scope, plan, sync)
2. Build phase start
3. Build sub-phase completion
4. Session end (mandatory)
5. On surprise or blocker discovery
6. Phase transition
7. **Approach rejected during investigate/plan → append to `rejected_alternatives[]`**
8. **Constraint discovered during investigate/build → append to `constraints_discovered[]`**
9. **Review pass completed → append to `review_evidence[]`** (use `/review` skill)

---

## Context Update Matrix (T4: Context Governance)

> Extends `artifact_storage` in `issue-driven-development.yaml`.
> Defines WHERE each type of knowledge belongs so AI agents don't scatter information arbitrarily.

| Where | Target | When |
|-------|--------|------|
| **Session-local** | `.agents/progress/*.json` (gitignored) | Ephemeral state — current phase, in-progress decisions, rejected_alternatives, constraints_discovered, surprises, blockers |
| **Accumulated lessons** | `.agents/context/lessons-learned.yaml` | A mistake was corrected this session, OR a recurring pattern is identified |
| **Domain context** | `.agents/context/{domain}.yaml` | Permanent technical constraint confirmed, architecture decision finalized, stable process established |
| **Harness update** | `.claude/hooks/*.js` | **Same mistake appears in lessons-learned TWICE** — mechanical enforcement now warranted |

### Harness Update Rule

When the same mistake appears twice in `lessons-learned.yaml`:
1. Identify the repeated pattern
2. **Write a failing test first** (TDD for harness)
3. Implement the hook that makes the test pass
4. Update coverage count in `harness.yaml`

> Do NOT add a third lessons-learned entry for the same mistake. Strengthen the hook instead.

---

## Tests

```bash
bash .agents/tests/harness/run-all.sh
```

72 tests covering:
- Entry point sync (11 tests)
- Commit guard (26 tests — includes T2 Decision Shadow advisory + gate approval checks)
- Cascade check (12 tests)
- Progress schema (7 tests)
- Integration lifecycle (2 tests)
- Process guard (14 tests)

---

## Directory Structure

### Committed to Git

```
.claude/
├── settings.json              # Hook registration
└── hooks/
    ├── sync-entry-points.js   # Entry point 3-file sync
    ├── cascade-check.js       # Triple-mirror reminder
    ├── commit-guard.js        # Phase-aware commit guard
    └── process-guard.js       # Review declaration without file reads (Stop hook)

.agents/
├── context/harness.yaml       # This context (SoT)
├── progress/.gitkeep          # Progress file directory
└── tests/harness/run-all.sh   # Test suite
```

### Gitignored

```
.claude/*          (except settings.json and hooks/)
.agents/progress/*.json
```
