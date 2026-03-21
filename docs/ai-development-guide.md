<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# AI Development Guide

> How to work on multi-session issues with AI coding tools in Naia OS.
> Technical implementation details: `.users/context/harness.md`

---

## The Core Problem

AI coding agents don't have persistent memory. When a session ends, everything learned in that session is gone. When context compaction happens mid-session, earlier decisions disappear too.

For a 30-minute bug fix this doesn't matter much. For a feature that spans multiple days and dozens of sessions, it becomes the main bottleneck:

- The AI re-investigates things already investigated
- Approaches already rejected get tried again
- "Why is it implemented this way?" gets answered wrong
- You spend session time on briefing instead of building

This guide explains how Naia OS solves this structurally.

---

## Progress Files: Session Continuity

For any feature-level work, create a progress file before the first session ends.

**Location**: `.agents/progress/issue-{N}-{slug}.json`
**Gitignored**: session-local only, not committed

```json
{
  "issue": "#42",
  "title": "Add avatar idle animation",
  "project": "naia-os",
  "current_phase": "build",
  "gates_cleared": ["understand", "scope", "plan"],
  "current_task": "Implement AnimationMixer loop",
  "key_decisions": [
    "Use Three.js AnimationMixer — consistent with upstream VRM"
  ],
  "rejected_alternatives": [
    {
      "approach": "AudioContext({sampleRate:16000})",
      "reason": "WebKitGTK freezes audio buffer to zeros when sampleRate is specified",
      "date": "2026-03-17"
    }
  ],
  "constraints_discovered": [
    {
      "constraint": "WebKitGTK AudioContext only works at default sampleRate",
      "scope": "shell/src/audio/*",
      "date": "2026-03-17"
    }
  ],
  "updated_at": "2026-03-14T14:30Z"
}
```

**Why `rejected_alternatives` matters**: When AI doesn't know an approach was already tried and failed, it tries it again. This wastes a session. Recording rejections with reasons prevents this — any AI reading this file knows not to suggest that approach.

**When to update**: At every phase transition. Before ending a session. When a constraint is discovered. When an approach is rejected.

---

## Worktree Pattern: Parallel Issues

For feature-level work, use worktrees rather than branches checked out in the main repo.

```bash
# Create worktree for issue #42
git worktree add ../naia-os-issue-42 -b issue-42-avatar-animation

# Work in the worktree
cd ../naia-os-issue-42
# ... all work for this issue happens here

# Main repo stays on main
cd ../naia-os
# ... unrelated work or reviews here
```

**Why not just branches?** A branch requires switching, which disrupts the main repo working state. A worktree is a separate directory — `naia-os/` stays on main, `naia-os-issue-42/` is on the feature branch. Both are accessible simultaneously without switching.

With AI tools, this matters more: each directory is an independent Claude Code context. You can have one session working on the feature, another reviewing main, without interference.

**Naming convention**: `issue-{N}-{slug}` for the branch, `../naia-os-issue-{N}` for the worktree directory.

---

## What the Hooks Do For You

Naia OS has four Claude Code hooks running on every session. You don't configure them — they run automatically.

### commit-guard.js

Reads your progress file before every `git commit`. If you're at phase `build` and try to commit without completing E2E testing and context sync, you get a warning:

```
[Harness] ⚠ Committing at phase "build" — phases remaining:
review → e2e_test → post_test_review → sync → sync_verify
```

This isn't a block — it's a warning. The commit proceeds. But the warning surfaces the question: "Is this actually done?"

The phase order is: `issue → understand → scope → investigate → plan → build → review → e2e_test → post_test_review → sync → sync_verify → report → commit`

If there's no progress file (simple changes, not feature work), commit-guard passes silently.

### cascade-check.js

When you modify a file in `.agents/context/`, it reminds you to update the corresponding `.users/context/` mirror (and `.users/context/ko/` if it exists). Context changes without mirror updates create drift between what AI sees and what humans see.

### sync-entry-points.js

`CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` must always be identical — different AI tools read different entry points but expect the same rules. Whenever one is edited, this hook syncs the other two automatically.

### process-guard.js

Detects "clean pass declaration without file reads." If an AI claims a review pass is clean but made no file read calls, the hook blocks the response. Prevents rubber-stamp reviews where AI declares success without actually looking at the code.

---

## Phase Gates: Where Humans Stay in Control

Four phases require explicit user confirmation before proceeding:

| Gate | What you're confirming |
|------|----------------------|
| **understand** | AI understood the issue correctly |
| **scope** | Investigation scope is appropriate |
| **plan** | Implementation plan is sound |
| **sync** | Context updates accurately reflect what was done |

AI cannot self-approve these gates. The progress file records when each gate was approved and by whom. This creates an audit trail of decision points.

---

## Context Update Rule: What Goes Where

| Information | Where | When |
|-------------|-------|------|
| Current phase, in-progress state | `.agents/progress/*.json` | Every session, gitignored |
| Repeated mistake corrected | `.agents/context/lessons-learned.yaml` | After correction |
| Permanent technical constraint | `.agents/context/{domain}.yaml` | After confirmation |
| Same mistake appearing twice in lessons | `.claude/hooks/*.js` | Mechanical enforcement |

The last row is the core principle of the harness: **if you wrote it in lessons-learned twice, write a hook instead.** A rule in a file gets forgotten. A hook in the execution path doesn't.

---

## What's Currently Missing

**session-inject**: This hook automatically injects the current progress file content into every AI session start. Without it, each new session starts without knowing which issue is in progress or what phase it's at. You have to tell the AI manually.

This is the most significant gap for contributors. Multi-session work on a feature requires manual context transfer at each session start. We're aware of this. It's part of the naia-agent-base work — once that's integrated, session-inject will be included automatically.

Until then: keep your progress file updated and start each session by pointing AI at it explicitly.

---

## Common Scenarios

### Starting work on an issue

1. Create worktree: `git worktree add ../naia-os-issue-N -b issue-N-description`
2. Open Claude Code in `../naia-os-issue-N/`
3. Create `.agents/progress/issue-N-description.json` with `current_phase: "issue"`
4. Ask AI to read the issue and walk through understand/scope gates

### Resuming after a break

Until session-inject is available, start the session with:
> "Read `.agents/progress/issue-N-description.json` and continue from where we left off."

The progress file has the current phase, decisions made, constraints discovered, and approaches rejected. AI should not need more than this to resume.

### When context compaction happens mid-session

Context compaction deletes earlier messages but the progress file persists on disk. AI should re-read it. If the AI seems to have forgotten key context, point it back to the progress file explicitly.

### Finishing work

1. Run E2E tests
2. Update `.agents/` context files with anything learned
3. Run `/manage-skills` if new patterns worth capturing
4. Get sync gate approval
5. Use `/merge-worktree` from the worktree directory — this creates a squash-merge commit with the naia-os conventional format and reads the progress file for Rejected: and Constraint: trailers
6. Delete worktree: `git worktree remove ../naia-os-issue-N`
