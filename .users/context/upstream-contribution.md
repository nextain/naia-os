<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Upstream OSS Contribution Workflow

> SoT: `.agents/context/upstream-contribution.yaml`

How to fork, research, inject context, and contribute back to upstream OSS projects. Applies whenever working in a fork of an external project.

**Case history**: whisper-rs (#63), vLLM (#73) — both failed due to skipping landscape research.

---

## Usage Type Classification

| Type | Description | When |
|------|-------------|------|
| **use-as-is** | Use upstream directly — no fork | Feature already exists upstream |
| **fork-internal** | Fork for internal use, not contributing back | Significant divergence or upstream won't accept |
| **upstream-contribution** | Fork with intent to contribute back | Fix/feature belongs in upstream |

> **Note**: Abandoning contribution is also a valid conclusion — don't force a PR upstream.

---

## Landscape Research (MUST happen before any implementation)

**Principle**: Understand what upstream thinks about this problem BEFORE writing any code.

| Area | Question | Where to Look | Output File |
|------|----------|---------------|-------------|
| Scope / layer | Is this in-scope for this project? | README, architecture docs | `agents-rules.json` |
| AI policy | Type A (banned) / B (conditional) / C (allowed)? | CONTRIBUTING.md, issue discussions | `agents-rules.json` |
| RFC history | Has this been discussed/decided before? | Issues labeled RFC, closed PRs with wontfix | `feature-design.yaml` |
| Sub-projects | Is there a related sub-project that owns this? | GitHub org, ROADMAP.md | `feature-design.yaml` |
| In-progress PRs | Is someone already implementing this? | Open PRs, linked issues | `feature-design.yaml` |
| Maintainer stance | What is the maintainer's position? | Issue comments, Discussions | `feature-design.yaml` |
| Coding conventions | What patterns does the code actually use? | Read source files directly | `coding-conventions.yaml` |
| Contribution requirements | What does CONTRIBUTING.md actually require? | CONTRIBUTING.md, CI config, PR templates | `contributing-guide.yaml` |
| Community tone | How does this community communicate? | Issue/PR discussion threads | `contributing-guide.yaml` |

> **If AI policy is Type A — stop immediately. Do not implement, do not open issue.**

> **vLLM #73 lesson**: Audio output was explicitly scoped out of vllm main (RFC #16052). vllm-omni was the correct target. Discovered only after full implementation.

---

## Fork Context Injection

**Principle**: Populate fork `.agents/` so AI sessions know upstream rules from day 1.

### Branch Policy

| Branch | Contents | Rule |
|--------|----------|------|
| `main` | upstream HEAD + `.agents/` context | AI config only — no code changes |
| `feature/*` | code changes only | `.agents/` excluded from upstream PR diff |

> **Never include `.agents/` in an upstream PR** — it is your private AI config.

### Required Context Files

| File | Purpose | Populated From |
|------|---------|---------------|
| `.agents/context/agents-rules.json` | Scope, AI policy, conventions, contribution requirements | CONTRIBUTING.md + actual code patterns |
| `.agents/context/feature-design.yaml` | RFC history, sub-projects, in-progress PRs | GitHub Issues/Discussions, ROADMAP.md |
| `.agents/context/coding-conventions.yaml` | Actual naming, formatting, patterns | Read source files, .editorconfig, linter configs |
| `.agents/context/contributing-guide.yaml` | Test requirements, PR process, sign-off, CLA | CONTRIBUTING.md, CI config, PR templates |

### Harness Setup

- Install harness in **fork** `.claude/hooks/` — not naia-os hooks
- When writing hooks: read naia-os `.claude/hooks/` as reference implementation first
- `PreToolUse` → blocking (abort before harmful action)
- `PostToolUse` → advisory (warn after action)
- `Stop` → review enforcement (block false clean-pass claims)
- **Harness limit**: Harness enforces style and process — design judgment remains human

---

## Upstream Issue First

**Principle**: Open issue on the **upstream repo** BEFORE writing implementation code.

### While Waiting for Response

| Allowed | Not Allowed |
|---------|-------------|
| Build `.agents/` context files | Write implementation code |
| Set up harness hooks | Open PR without upstream issue reference |
| Read and understand upstream code | |
| Write tests (no implementation) | |

**No-response policy**: If no response after 2 weeks → proceed with PR-1 (interface only, minimal footprint).

**Progress file**: Record `upstream_issue_ref: "owner/repo#N"` in `.agents/progress/*.json`.

---

## Implementation Principles

- Every line must be human-defensible — if you cannot explain it, do not write it
- Avoid AI slop signals: decorative comments, speculative code, over-engineering
- Read upstream code first — never assume patterns
- No guessing: if behavior is unclear, read the actual implementation
- Minimal footprint: change as little as possible in upstream code

---

## PR Readiness Criteria

- [ ] Upstream CI checks pass (upstream's checks, not naia-os)
- [ ] No duplicate: confirmed no existing PR or issue addresses this
- [ ] Every line human-defensible (no AI slop)
- [ ] AI attribution included (`Assisted-by:` trailer)
- [ ] `upstream_issue_ref` recorded in progress file
- [ ] `.agents/` files excluded from PR diff

---

## Anti-Patterns (Case History)

| Pattern | Case | Consequence | Rule |
|---------|------|-------------|------|
| Fork and code immediately | vLLM #73 | Discovered vllm-omni (correct target) only after full implementation | Landscape research before any code |
| Skip RFC history check | vLLM #73 | Audio output explicitly scoped out of vllm main (RFC #16052) | Search RFC/wontfix/out-of-scope in Issues first |
| No upstream issue before coding | vLLM #73 | Implementation misaligned with maintainer's plans | Open upstream issue, wait for signal |
| Assume naia-os harness = upstream quality | vLLM #73 | naia-os harness passing ≠ upstream will accept | Upstream CI + CONTRIBUTING.md is the quality bar |
| Ignore AI policy | whisper-rs #63 | Violated project's AI-generated code policy | Check AI policy (Type A/B/C) before any work |
