# Harness Engineering Onboarding Test Scenarios

These scenarios verify that AI coding agents correctly understand and use the harness engineering system when working in this project.

## How to Test

1. Open a new AI session in this repo
2. Ensure session reads `agents-rules.json` and `harness.yaml`
3. Copy each scenario prompt and paste it into your AI coding agent
4. Compare the response against the expected behavior

---

## Test 1: Harness Awareness — "What hooks are active?"

**Prompt:**
> What Claude Code hooks are set up in this project?

**Expected:**
- Agent mentions 3 hooks: sync-entry-points, cascade-check, commit-guard
- Agent explains each hook's purpose
- Agent references `.claude/settings.json` for registration
- Agent does NOT describe hooks as blocking (they are PostToolUse advisory)

---

## Test 2: Entry Point Sync — Editing CLAUDE.md

**Prompt:**
> I need to update CLAUDE.md with a new section. Will AGENTS.md and GEMINI.md be updated too?

**Expected:**
- Agent confirms: yes, sync-entry-points.js automatically copies changes
- Agent explains the 3-file sync (CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md)
- Agent mentions that only existing files are synced (won't create missing files)

---

## Test 3: Triple-Mirror Reminder

**Prompt:**
> I just updated `.agents/context/architecture.yaml`. What else do I need to do?

**Expected:**
- Agent reminds about triple-mirror: also update `.users/context/architecture.md` and `.users/context/ko/architecture.md`
- Agent mentions cascade-check.js will also remind automatically
- Agent explains this is the triple-mirror rule

---

## Test 4: Progress File Usage

**Prompt:**
> I'm starting feature work on Issue #50. How do I track my progress for session handoff?

**Expected:**
- Agent explains progress files: `.agents/progress/*.json`
- Agent provides or references the schema (issue, title, project, current_phase, etc.)
- Agent mentions update points (gate approvals, build phase, session end)
- Agent mentions files are gitignored (session-local only)

---

## Test 5: Commit Guard Understanding

**Prompt:**
> I've finished building the feature. Can I commit now?

**Expected:**
- Agent checks whether E2E test, post-test review, sync, and sync_verify are done
- Agent explains the commit guard warns if phase < sync_verify
- Agent references the 13-phase workflow
- Agent does NOT say "just commit" without verifying phase completion

---

## Test 6: Progress File Schema

**Prompt:**
> Show me an example progress file for an issue I'm working on.

**Expected:**
- Agent produces valid JSON with required fields: issue, title, project, current_phase, updated_at
- Agent includes optional fields: gate_approvals, decisions, surprises, blockers
- Agent uses ISO timestamp format for dates
- Agent mentions the file goes in `.agents/progress/`

---

## Test 7: Running Harness Tests

**Prompt:**
> How do I verify the hooks are working correctly?

**Expected:**
- Agent references: `bash .agents/tests/harness/run-all.sh`
- Agent mentions 28 tests across 5 categories
- Agent explains the test categories (sync, commit-guard, cascade, progress schema, integration)

---

## Test 8: New Hook Development

**Prompt:**
> I want to add a new hook that checks for console.log usage. How?

**Expected:**
- Agent explains the hook protocol (stdin JSON, stdout JSON)
- Agent references `.claude/settings.json` for registration
- Agent mentions PostToolUse event matcher (e.g., `Edit|Write`)
- Agent recommends adding tests to `run-all.sh`
- Agent mentions updating `harness.yaml` documentation

---

## Test 9: Session End Handoff

**Prompt:**
> I'm ending my session now. The feature is at the build phase. What should I save?

**Expected:**
- Agent insists on updating the progress file with current state
- Agent mentions this is mandatory at session end
- Agent mentions recording any decisions made and surprises found
- Agent mentions setting `current_phase` to the actual current phase

---

## Test 10: Harness + Workflow Integration

**Prompt:**
> How does the harness system relate to the 13-phase development workflow?

**Expected:**
- Agent explains commit-guard enforces phase ordering mechanically
- Agent explains cascade-check supports the sync phase
- Agent explains sync-entry-points enforces cascade rules
- Agent explains progress files enable commit-guard and session handoff
- Agent references both `harness.yaml` and `issue-driven-development.yaml`

---

## Verification Checklist

- [ ] Agent knows all 3 hooks and their purposes (Test 1)
- [ ] Agent understands auto-sync of entry points (Test 2)
- [ ] Agent reminds about triple-mirror updates (Test 3)
- [ ] Agent can explain progress file schema and usage (Test 4)
- [ ] Agent checks phase before allowing commit (Test 5)
- [ ] Agent produces valid progress file JSON (Test 6)
- [ ] Agent knows how to run harness tests (Test 7)
- [ ] Agent can guide new hook development (Test 8)
- [ ] Agent enforces session-end progress update (Test 9)
- [ ] Agent connects harness to workflow phases (Test 10)

## Scoring

| Score | Result |
|-------|--------|
| 10/10 | Full harness onboarding works |
| 7-9/10 | Mostly works, minor context gaps |
| 4-6/10 | Partial — harness context needs enrichment |
| <4/10 | Harness context insufficient — major gaps |
