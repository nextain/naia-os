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

### commit-guard.js

| | |
|---|---|
| **Trigger** | PostToolUse on Bash (git commit commands) |
| **Purpose** | Warn when committing before E2E test and context sync |
| **Behavior** | Reads progress file, warns if phase < sync_verify |

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
  "surprises": [],
  "blockers": [],
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

---

## Tests

```bash
bash .agents/tests/harness/run-all.sh
```

28 tests covering:
- Entry point sync (6 tests)
- Commit guard (8 tests)
- Cascade check (8 tests)
- Progress schema (4 tests)
- Integration lifecycle (2 tests)

---

## Directory Structure

### Committed to Git

```
.claude/
├── settings.json              # Hook registration
└── hooks/
    ├── sync-entry-points.js   # Entry point 3-file sync
    ├── cascade-check.js       # Triple-mirror reminder
    └── commit-guard.js        # Phase-aware commit guard

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
