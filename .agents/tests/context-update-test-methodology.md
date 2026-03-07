<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Context Update Test Methodology

How to verify that `.agents/` context updates actually work — that AI coding agents behave correctly after reading the updated context.

## Problem

Context files (`.agents/`, `.users/`) are the primary quality mechanism for AI-native contributions. But there's no way to know if a context change actually improves AI behavior without testing it.

Traditional software has unit tests. Context files need **AI behavior tests**.

## Principles

1. **Headless testing** — Run tests in separate, fresh AI sessions (not the session that wrote the context)
2. **Black-box verification** — Test what the AI *does*, not what it *knows*
3. **Multi-agent coverage** — Test across multiple AI tools (Claude Code, Codex, Gemini, etc.)
4. **Reproducible prompts** — Same prompt → consistent expected behavior
5. **Pass/fail criteria** — Each test has clear, checkable expected outcomes

## Test Types

### Type 1: Onboarding Tests

Verify that a fresh AI session correctly understands the project and guides contributors.

- **When to run**: After modifying `contributing.yaml`, `open-source-operations.yaml`, `philosophy.yaml`, or `agents-rules.json`
- **Test file**: `.agents/tests/ai-native-onboarding-test.md`
- **Method**: Fresh clone → open with AI tool → paste scenario prompt → compare response

### Type 2: Protection Tests

Verify that AI agents refuse prohibited actions (license removal, attribution stripping, etc.).

- **When to run**: After modifying `agents-rules.json` license_protection section, or `contributing.yaml` license_protection section
- **Test file**: `.agents/tests/license-protection-test.md`
- **Method**: Fresh session → attempt violation → verify refusal

### Type 3: Workflow Tests

Verify that AI agents follow the correct development process.

- **When to run**: After modifying workflow files (`development-cycle.yaml`, `issue-driven-development.yaml`)
- **Test file**: Create per-workflow test scenarios as needed
- **Method**: Fresh session → ask AI to perform a task → verify it follows the workflow

### Type 4: Architecture Tests

Verify that AI agents understand the codebase structure and make correct technical decisions.

- **When to run**: After modifying `architecture.yaml`, `openclaw-sync.yaml`, or other technical context
- **Test file**: Create per-context test scenarios as needed
- **Method**: Fresh session → ask technical question → verify accurate understanding

## Execution Protocol

### Step 1: Write Test Scenarios

Each test scenario must include:

```markdown
## Test N: {Name}

**Prompt:**
> {Exact text to paste into the AI tool}

**Expected:**
- {Checkable behavior 1}
- {Checkable behavior 2}
- {Behavior that should NOT occur}
```

### Step 2: Run Headless Tests

For each target AI tool:

1. **Start a fresh session** (new conversation, no prior context from the test author)
2. Open the repo (clone or navigate to it)
3. Wait for the AI to read its entry point (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)
4. Paste the test prompt exactly as written
5. Record the AI's response verbatim

**Critical**: The person running the test must NOT be the person who wrote the context. The test validates whether the context *alone* conveys the right information.

### Step 3: Evaluate Results

For each test scenario, check:

- [ ] All expected behaviors observed
- [ ] No prohibited behaviors occurred
- [ ] Response quality is acceptable (not just technically correct)

### Step 4: Score and Act

| Score | Interpretation | Action |
|-------|---------------|--------|
| 90%+ pass | Context is effective | Ship it |
| 70-89% pass | Minor gaps | Enrich the specific context areas that failed |
| 50-69% pass | Significant gaps | Review context structure, add missing information |
| <50% pass | Context is insufficient | Major rewrite needed |

### Step 5: Iterate

If tests fail:
1. Identify which context file is responsible for the gap
2. Update the context file
3. Re-run only the failed tests in a fresh session
4. Repeat until all tests pass

## Automation (Future)

### Phase 1 (Current): Manual headless testing

- Human opens fresh AI sessions
- Human pastes prompts and records responses
- Human evaluates pass/fail

### Phase 2: Semi-automated

- Script spawns fresh AI sessions via CLI (Claude Code `--prompt`, Codex CLI, etc.)
- Script captures responses
- Human evaluates pass/fail

### Phase 3: Fully automated

- CI runs AI sessions on PR that modifies `.agents/` files
- AI evaluates AI responses (meta-testing)
- Results posted as PR comment

## When to Run Tests

| Trigger | Required Tests |
|---------|---------------|
| New `.agents/context/` file created | Onboarding (relevant scenarios) |
| Existing context file modified | Protection + relevant Type 1-4 tests |
| New contribution type added | Onboarding Test 2 (all 10 types) |
| License/attribution rules changed | All protection tests |
| Workflow modified | Relevant workflow tests |
| Before major release | Full test suite |

## Test File Naming Convention

```
.agents/tests/
├── ai-native-onboarding-test.md          # Onboarding scenarios
├── license-protection-test.md            # License protection scenarios
├── context-update-test-methodology.md    # This document (methodology)
└── {topic}-test.md                       # Future test files
```

## Related Files

- **Onboarding tests**: `.agents/tests/ai-native-onboarding-test.md`
- **License tests**: `.agents/tests/license-protection-test.md`
- **Operations model**: `.agents/context/open-source-operations.yaml`
- **Contributing guide**: `.agents/context/contributing.yaml`
