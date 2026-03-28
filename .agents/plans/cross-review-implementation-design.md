# Cross-Review Framework — Implementation Design

> **Parent**: `.agents/plans/cross-review-framework.md` (high-level design, converged)
> **GitHub Issue**: https://github.com/nextain/naia-os/issues/165
> **Status**: Converged (Round 4, adversarial 2× CLEAN)
> **Phase**: Phase 1 MVP

Date: 2026-03-28

---

## 1. Integration Point: Claude Code Skill

The framework is invoked as a Claude Code skill (`/cross-review`), registered via
path file `.claude/skills/cross-review` (text file containing `../../.agents/skills/cross-review`,
following the existing project convention — NOT a filesystem symlink, which is unreliable on Windows).

The skill uses `disable-model-invocation: true`, meaning it is a **prompt-based instruction set**
loaded into the main agent's context when the user invokes `/cross-review`. The main agent
(not the skill itself) then executes the instructions, including spawning reviewer sub-agents
via the `Agent` tool. This is the same pattern used by all existing skills in the project
(e.g., `manage-skills`, `verify-implementation`).

The main agent orchestrates:
1. Load a profile YAML
2. Spawn reviewer agents via the `Agent` tool (supports `model` parameter per agent)
3. Collect structured reports
4. Run the 3-phase protocol (independent → vote → selective debate)
5. Log events to JSONL

No custom runtime, no external dependencies. Pure Claude Code primitives.

### 1.1 Model Selection

The Claude Code `Agent` tool accepts an optional `model` parameter: `"sonnet"`, `"opus"`, `"haiku"`.
This enables the profile's `model_policy` to be enforced:
- Phase 1 reviewers: spawned with `model: profile.model_policy.judgment` (default: sonnet)
- Phase 3 debate/arbitration: spawned with `model: profile.model_policy.arbitration` (default: opus)
- `model_policy.generation` (haiku) applies to drafting/summarization tasks, not review agents

NOTE: All reviewers in MVP use the same model tier (judgment). Model cascading (different
models per phase) is Phase 4. MVP validates that the `model` parameter works correctly.

---

## 2. File Structure

```
.agents/
├── skills/
│   └── cross-review/
│       └── SKILL.md              # Skill definition (orchestrator prompt)
├── profiles/
│   ├── _base.yaml                # Base profile (inherited by all)
│   ├── code-review.yaml          # Code quality review (MVP)
│   ├── analysis-review.yaml      # Investigation/analysis (Phase 2)
│   ├── security-review.yaml      # Security audit (Phase 2)
│   ├── research.yaml             # Deep research (Phase 2)
│   └── doc-review.yaml           # Documentation accuracy (Phase 2)
├── reviews/                      # Event logs (gitignored)
│   └── {review-id}.jsonl         # Append-only event log per review
├── prompts/                      # Reviewer system prompts
│   ├── correctness.md            # MVP
│   ├── security-expert.md        # MVP
│   ├── slop-detector.md          # MVP
│   ├── adversarial.md            # Phase 2
│   ├── platform-expert.md        # Phase 2
│   ├── methodology-critic.md     # Phase 2
│   └── source-verifier.md        # Phase 2
└── plans/
    ├── cross-review-framework.md           # High-level design (converged)
    └── cross-review-implementation-design.md  # This file

.claude/
├── skills/
│   └── cross-review              # Text file containing: ../../.agents/skills/cross-review
└── hooks/
    └── process-guard.js          # Extended (Phase 3+) to check cross-review format
```

---

## 3. Module Design

The "framework" is not a monolithic codebase — it is a **structured skill prompt**
that orchestrates existing Claude Code primitives. The "modules" are sections of
the SKILL.md (~350 lines of prompt) that handle each responsibility.

### 3.1 Module Map

```
SKILL.md (single file, ~350 lines of prompt)
├── Section 1: Profile Loader
│   - Read and parse profile YAML
│   - Validate required fields
│   - Resolve inheritance (_base.yaml)
│   - Check constraints (quorum invariant, budget consistency)
│
├── Section 2: Reviewer Spawner
│   - For each reviewer spec in profile:
│     - Load system prompt from prompts/{id}.md
│     - Construct Agent() call with:
│       - review target (files/analysis to review)
│       - system prompt (expertise + review strategy)
│       - report format template
│       - evidence requirements (min files, must read source)
│   - Spawn all reviewers in PARALLEL via multiple Agent() calls
│
├── Section 3: Report Parser
│   - Parse structured markdown reports from each reviewer
│   - Extract: verdict, findings[], files_read[], checked[]
│   - Validate: min_files_read met, must_read_source met
│   - Compute per-reviewer quality signals (Tier 1):
│     - Claim-to-Read ratio
│     - Specificity score
│     - Verifiability (check cited files/lines exist)
│
├── Section 4: Finding Matcher + Voter
│   - Match findings across reviewers (file:line overlap, Jaccard fallback)
│   - Classify: CONFIRMED (all agree) / CONTESTED (partial) / DISMISSED (solo, R>=3)
│   - For R=2: skip auto-dismiss, all non-unanimous → CONTESTED
│
├── Section 5: Debate Manager (Phase 3)
│   - For CONTESTED findings only:
│     - Spawn cross-examination agent (probing questions)
│     - Max 2-3 sub-rounds
│     - Post-debate majority vote: ceil(R/2)
│     - Even-R tie → CONFIRMED (bias toward surfacing)
│
├── Section 6: Round Manager
│   - Track clean_count across rounds
│   - Check convergence (all_agree / no_vote_change)
│   - Check budget (per_reviewer → per_round → total)
│   - Check max_rounds limit
│   - Produce consolidated round report
│
├── Section 7: Event Logger
│   - Append events to .agents/reviews/{review-id}.jsonl
│   - Event types per schema in framework design doc
│
└── Section 8: Health Monitor (lightweight, MVP)
    - Rolling z-score on per-reviewer dismissed-finding count
    - If reviewer's findings dismissed >2x in current review → warning
    - Full Phi Accrual / formal dismissal deferred to Phase 2
```

### 3.2 Data Flow

```
User invokes /cross-review [profile] [target]
  │
  ▼
┌─ Profile Loader ────────────────────────────────────┐
│ Read .agents/profiles/{profile}.yaml                 │
│ Merge with _base.yaml (child overrides parent)       │
│ Validate constraints                                 │
└──────────────────┬───────────────────────────────────┘
                   │ profile config
                   ▼
┌─ Round Loop ─────────────────────────────────────────┐
│                                                       │
│  ┌─ Phase 1: Reviewer Spawner ─────────────────────┐ │
│  │ Agent(prompt=system_prompt+target+format)  ×R    │ │
│  │ Parallel execution, isolated contexts            │ │
│  └──────────────┬──────────────────────────────────┘ │
│                  │ R structured reports                │
│                  ▼                                     │
│  ┌─ Phase 2: Report Parser + Matcher + Voter ──────┐ │
│  │ Parse reports → extract findings                 │ │
│  │ Match findings (file:line overlap / Jaccard)     │ │
│  │ Classify: CONFIRMED / CONTESTED / DISMISSED      │ │
│  │ Quality signal check per reviewer                │ │
│  └──────────────┬──────────────────────────────────┘ │
│                  │ classified findings                 │
│                  ▼                                     │
│  ┌─ Phase 3: Debate (if CONTESTED exist) ──────────┐ │
│  │ Cross-examination via Agent() for each contested │ │
│  │ Max 2-3 sub-rounds                               │ │
│  │ Post-debate majority vote                        │ │
│  └──────────────┬──────────────────────────────────┘ │
│                  │ final findings                      │
│                  ▼                                     │
│  ┌─ Round Result ──────────────────────────────────┐ │
│  │ 0 confirmed → clean_count++                      │ │
│  │ clean_count >= clean_rounds → COMPLETE            │ │
│  │ confirmed > 0 → clean_count=0, report to user    │ │
│  │ budget/max_rounds exceeded → COMPLETE (partial)   │ │
│  └──────────────┬──────────────────────────────────┘ │
│                  │                                     │
│  Event Logger: append to JSONL at each step           │
│  Health Monitor: track per-reviewer dismissal count   │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
         Consolidated Report to User
```

---

## 4. Reviewer Agent Prompt Design

Each reviewer agent receives a constructed prompt with 4 sections:

```markdown
## Role
You are a {expertise} reviewing {target_description}.
{system_prompt from prompts/{id}.md}

## Review Strategy
{strategy instructions — different per reviewer, enforcing DMAD diversity}
- You MUST use {specific methodology} for this review
- Focus on {specific concerns}

## Review Target
{the actual content to review — analysis document, code diff, etc.}

## Report Format (MUST follow exactly)
## Review Pass {round} — Reviewer {id} ({expertise})

**Scope**: {what you reviewed}

**Files read**:
- `{file}:{start}-{end}` — {reason}

**Checked**:
- [x] {check item} — {result with evidence}

**Findings**: {count}
- [{severity}] {description} — `{file}:{line}` {evidence}

**Cross-check** (Round 2+ only):
- Reviewer {X} Finding {Y}: {AGREE|DISAGREE} — {evidence}

**Verdict**: {CLEAN | FOUND_ISSUES | REQUESTER_CONTEXT_DRIFT}
```

### 4.1 Report Parsing Strategy

Reviewer reports are free-text markdown. Parsing must be ROBUST:

1. **Verdict extraction**: Search for line starting with `**Verdict**:` — extract keyword (CLEAN/FOUND_ISSUES/DRIFT)
2. **Findings extraction**: Search for lines matching `- [{severity}]` pattern — regex: `/^- \[(CRITICAL|HIGH|MEDIUM|LOW)\]\s+(.+)/`
3. **File:line extraction from findings**: regex: `/`([^`]+):(\d+)(?:-(\d+))?`/` — captures file, start line, optional end line
4. **Files read extraction**: Search for lines under `**Files read**:` matching `/`([^`]+):(\d+)-(\d+)`/`
5. **Findings count**: Search for `**Findings**: {N}` — extract N, cross-validate with actual finding count

**Fallback**: If structured parsing fails, treat entire report as free text and extract findings by searching for severity keywords + file references. Log PARSE_WARNING event.

**The main agent performs parsing** (not a script). This is reliable because the main agent understands markdown structure. The regex patterns above are guidelines for the agent, not literal code.

### 4.2 Strategy Diversity (DMAD)

Each reviewer gets a DIFFERENT review methodology, not just a different persona:

| Reviewer | Strategy | Methodology |
|----------|----------|-------------|
| A | Line-by-line logic analysis | Read every function, trace data flow, check edge cases |
| B | Pattern-based security scan | Check for known vulnerability patterns (OWASP), auth flows, input validation |
| C | Architectural assessment | Check module boundaries, dependency direction, abstraction leaks |
| D (if R>=4) | Adversarial attack | Try to break the design, find inputs that cause undefined behavior |
| E (if R>=5) | Specification compliance | Check every claim against source code, verify file:line citations |

---

## 5. Profile YAML Specification

### 5.1 Base Profile

```yaml
# .agents/profiles/_base.yaml
apiVersion: cross-review/v1
kind: ReviewProfile
metadata:
  name: _base
  description: "Base profile — inherited by all profiles"

spec:
  reviewers:
    count: 3

  consensus:
    strategy: "unanimous"
    clean_rounds: 2
    max_debate_rounds: 3
    convergence: "all_agree"

  limits:
    max_rounds: 10
    round_timeout_seconds: 300
    review_timeout_seconds: 1800

  dismissal:
    finding_dismissal: "unanimous_except_target"
    participant_dismissal: "unanimous_except_target"
    strikes_before_dismissal: 2
    quorum:
      flag: 1
      dismiss: "all_except_target"
    replacement_policy: "spawn_fresh"

  health_check:
    strategy: "majority_except_target"
    triggers_refresh: true

  quality_signals:
    claim_to_read_ratio: 3.0
    min_specificity: 0.3
    min_verifiability: 0.7
    min_novelty: 0.5

  evidence_requirements:
    min_files_read: 3
    must_read_source: true

  model_policy:
    generation: "haiku"
    judgment: "sonnet"
    arbitration: "opus"

  diversity:
    model_heterogeneity: "recommended"
    strategy_diversity: "required"

  cost:
    max_total_tokens: 500000
    per_round_tokens: 250000
    per_reviewer_tokens: 50000

  logging:
    event_log_path: ".agents/reviews/{review_id}.jsonl"
```

### 5.2 Example: Code Review Profile

```yaml
# .agents/profiles/code-review.yaml
apiVersion: cross-review/v1
kind: ReviewProfile
metadata:
  name: code-review
  description: "Code quality and correctness review"
  extends: _base

spec:
  reviewers:
    count: 3
    specs:
      - id: correctness
        expertise: "Logic and correctness"
        prompt_ref: prompts/correctness.md
        strategy: "Line-by-line logic analysis, trace data flow"
      - id: security
        expertise: "Security and safety"
        prompt_ref: prompts/security-expert.md
        strategy: "Pattern-based security scan, OWASP checks"
      - id: slop-detector
        expertise: "SLOP and quality detection"
        prompt_ref: prompts/slop-detector.md
        strategy: "Verify all claims against source, check file:line citations"

  consensus:
    strategy: "unanimous"
    clean_rounds: 2

  evidence_requirements:
    min_files_read: 5
    must_read_source: true
```

---

## 6. Finding Matching Algorithm (Pseudocode)

```
function matchFindings(reports: ReviewerReport[]): MatchedFinding[] {
  allFindings = flatMap(reports, r => r.findings.map(f => {id: f.id, reviewer: r.id, ...f}))
  matched = []
  used = Set()

  // Phase 1: file:line overlap matching — SORTED by overlap descending
  pairs = []
  for each pair (fA, fB) where fA.reviewer != fB.reviewer:
    score = overlapScore(fA, fB)
    if score > 0: pairs.push({fA, fB, score})
  pairs.sort(by: score DESC)  // Best overlap first — greedy on quality

  for each {fA, fB, score} in pairs:
    if used.has(fA.id) or used.has(fB.id): continue
    matched.push({findings: [fA, fB], score})
    used.add(fA.id); used.add(fB.id)

  // Phase 2: extend matches (if 3rd reviewer also matches)
  for each match in matched:
    for each unmatched finding fC:
      if fC.reviewer not in match.reviewers:
        if overlapScore(fC, match.findings[0]) > 0:
          match.findings.push(fC)
          used.add(fC.id)

  // Phase 3: Jaccard fallback for unmatched findings without file:line
  for each pair of unmatched findings (fA, fB):
    if neither has file:line AND jaccard(stem(fA.description), stem(fB.description)) > 0.5:
      matched.push({findings: [fA, fB]})
      used.add(fA.id); used.add(fB.id)

  // Remaining unmatched = solo findings
  for each finding not in used:
    matched.push({findings: [f], solo: true})

  return matched
}

function overlapScore(fA, fB): number {
  // Multi-file: check ALL (file, line_range) pairs
  totalOverlap = 0
  for each (fileA, rangeA) in fA.locations:
    for each (fileB, rangeB) in fB.locations:
      if fileA == fileB:
        overlap = intersect(rangeA, rangeB).length
        totalOverlap += overlap
  return totalOverlap  // 0 = no match, >0 = matched
}

function classify(match, R): "CONFIRMED" | "CONTESTED" | "DISMISSED" {
  supporters = match.findings.length
  if supporters == R: return "CONFIRMED"
  if supporters == 1 and R >= 3: return "DISMISSED"
  return "CONTESTED"
}
```

---

## 7. Event Log Schema (JSONL)

Each line is a JSON object with `type` and `timestamp`:

```jsonl
{"type":"REVIEW_STARTED","review_id":"cr-20260328-001","profile":"code-review","target":"#164 analysis","timestamp":"2026-03-28T12:00:00Z"}
{"type":"REVIEWER_SPAWNED","review_id":"cr-20260328-001","reviewer_id":"correctness","expertise":"Logic and correctness","model":"sonnet","timestamp":"2026-03-28T12:00:01Z"}
{"type":"REPORT_SUBMITTED","review_id":"cr-20260328-001","round":1,"reviewer_id":"correctness","verdict":"FOUND_ISSUES","findings_count":2,"files_read":["browser.rs:1-100","panel.rs:1-50"],"timestamp":"2026-03-28T12:02:30Z"}
{"type":"FINDING_RAISED","review_id":"cr-20260328-001","round":1,"reviewer_id":"correctness","finding_id":"F-001","severity":"HIGH","file":"browser.rs","line":61,"description":"libc::kill without cfg guard"}
{"type":"FINDING_CONFIRMED","review_id":"cr-20260328-001","round":1,"finding_id":"F-001","supporters":["correctness","security"]}
{"type":"FINDING_CONTESTED","review_id":"cr-20260328-001","round":1,"finding_id":"F-002","supporters":["correctness"],"challengers":["security"]}
{"type":"VOTE_CAST","review_id":"cr-20260328-001","round":1,"voter_id":"security","finding_id":"F-002","vote":"dismiss","evidence":"Function is only called from trusted internal code path"}
{"type":"ROUND_COMPLETED","review_id":"cr-20260328-001","round":1,"confirmed":1,"dismissed":1,"contested":1,"clean_count":0}
{"type":"REVIEW_COMPLETED","review_id":"cr-20260328-001","rounds_total":3,"final_status":"clean","timestamp":"2026-03-28T12:15:00Z"}
```

---

## 8. SKILL.md Structure (Orchestrator Prompt)

```markdown
---
name: cross-review
description: Multi-agent cross-review — spawn reviewers, collect reports, vote, debate, converge.
disable-model-invocation: true
argument-hint: "<profile-name> <review-target-description>"
---

# Cross-Review

## Step 1: Parse Arguments
- Profile name (default: "code-review")
- Review target description

## Step 2: Load Profile
- Read .agents/profiles/{profile}.yaml
- If `extends` field: read parent, deep merge (child overrides)
- Validate: reviewer count >= 2, quorum invariant, budget consistency

## Step 3: Initialize Review
- Generate review_id: cr-{date}-{seq}
- Log REVIEW_STARTED event
- Display review parameters to user

## Step 4: Round Loop
For each round (1 to max_rounds):

### Phase 1: Independent Review
- For each reviewer in profile.spec.reviewers.specs:
  - Read prompts/{prompt_ref}
  - Construct reviewer prompt (role + strategy + target + format)
  - Spawn via Agent() tool (parallel, all at once)
- Collect all reports
- Log REVIEWER_SPAWNED + REPORT_SUBMITTED events

### Phase 2: Voting
- Parse reports, extract findings
- Quality signal check (Tier 1: claim-to-read, specificity, verifiability)
- Match findings (file:line overlap → Jaccard fallback)
- Classify: CONFIRMED / CONTESTED / DISMISSED (R=2 special case)
- Log FINDING_* events

### Phase 3: Selective Debate (if CONTESTED exist)
- For each CONTESTED finding:
  - Spawn cross-examination agent
  - Max debate sub-rounds per profile
  - Post-debate majority vote: ceil(R/2)
  - Even-R tie → CONFIRMED (bias toward surfacing)
  - **R=2 NOTE**: ceil(2/2)=1, so finding raiser's vote alone confirms.
    Phase 3 is effectively a no-op for R=2. The formal dismissal flow
    (Section 3.2 in framework doc) is the override mechanism for R=2.
- Log VOTE_CAST events

### Round Result
- Count confirmed findings
- If 0: clean_count++; check convergence
- If >0: clean_count=0; report findings to user; wait for response
- Check budget limits
- Log ROUND_COMPLETED

## Step 5: Report
- Produce consolidated report (format per framework design doc Section 4.2)
- Log REVIEW_COMPLETED
- Display final result

## Step 6: Health Summary
- Per-reviewer: findings raised, confirmed, dismissed
- Flag reviewers with high dismissal rate (>2 dismissed in this review)
```

---

## 9. Reviewer System Prompts (Examples)

### prompts/correctness.md
```markdown
You are a correctness reviewer. Your methodology is LINE-BY-LINE LOGIC ANALYSIS.

For every function/method in the review target:
1. Trace the data flow from inputs to outputs
2. Check every conditional branch — what happens in the else case?
3. Check error handling — what if this call fails?
4. Check edge cases — empty inputs, null, overflow, concurrent access
5. Verify that the documented behavior matches the actual code behavior

You MUST cite specific file:line for every finding.
You MUST read the actual source files, not rely on summaries.
Do NOT report style issues — focus only on logical correctness.
```

### prompts/slop-detector.md
```markdown
You are a SLOP detector. Your methodology is CLAIM VERIFICATION.

For every claim in the review target:
1. Does it cite a specific file:line? If not, it is vague — flag it.
2. If it cites file:line, READ that file and verify the claim matches reality.
3. Does the claim add new information, or is it parroting the original prompt?
4. Is the language hedging ("it's worth noting", "arguably", "consider")?
5. Are there self-contradictions within the document?

Your primary signal: VERIFIABILITY. Every claim must be grounded in evidence.
Flag any claim that you cannot verify by reading the source.
```

### prompts/adversarial.md
```markdown
You are an adversarial reviewer. Your methodology is ATTACK EVERY ASSUMPTION.

1. For every design decision: what is the failure mode? What input breaks it?
2. For every "this is safe because...": prove it is NOT safe with a counterexample.
3. For every edge case claimed to be handled: find an edge case that is NOT.
4. For every numeric threshold: why this number and not another?
5. Challenge the scope: what is explicitly NOT covered that SHOULD be?

You MUST read source files to find counterexamples.
Vague "this might be a problem" findings are SLOP — cite specific evidence.
```

---

## 10. Integration with Existing Harness

### 10.1 process-guard.js Extension (Phase 3+, not MVP)

Current process-guard blocks "clean" declarations without file reads.
Future extension: also check for cross-review report format when the
`/cross-review` skill was invoked in the session.

### 10.2 progress.json Integration

```json
{
  "review_evidence": [
    {
      "type": "cross-review",
      "profile": "code-review",
      "review_id": "cr-20260328-001",
      "rounds": 3,
      "reviewers": ["correctness", "security", "slop-detector"],
      "consensus": "unanimous",
      "result": "clean",
      "clean_count": 2,
      "events_file": ".agents/reviews/cr-20260328-001.jsonl",
      "date": "2026-03-28"
    }
  ]
}
```

### 10.3 .gitignore

```
.agents/reviews/*.jsonl
```

---

## 11. MVP Scope (Phase 1)

### Included
- SKILL.md orchestrator (~350 lines)
- _base.yaml + code-review.yaml (2 profile files; analysis-review uses _base directly, no separate file)
- 3 reviewer prompts (correctness, security, slop-detector)
- Finding matching (file:line overlap + Jaccard)
- Phase 2 voting (unanimity/majority classification)
- Phase 3 selective debate (simple cross-examination)
- JSONL event logging
- Lightweight health monitor (dismissal count tracking)
- Consolidated report output

### Deferred to Phase 2+
- Profile inheritance resolution — YAML deep merge (~20 lines code, deferred to keep MVP simple)
- Formal finding dismissal with strikes/voting — requires persistent state across rounds (Phase 2)
- Participant dismissal and replacement — depends on formal dismissal (Phase 2)
- Context drift detection (REQUESTER_CONTEXT_DRIFT) — requires requester re-read enforcement hook (Phase 3)
- KS adaptive stability convergence — underpowered at MVP scale, needs R>=5 (Phase 3)
- Phi Accrual health monitoring — cold-start problem, needs calibration data from MVP runs (Phase 3)
- process-guard.js integration — needs cross-review report format stabilized first (Phase 3)
- Model cascading per phase — MVP uses single model tier per review; cascading in Phase 4
- MiniCheck / Tier 3 quality signals — requires local model deployment (Phase 4)

### MVP Budget Reality Check

With `clean_rounds: 2` and `R=3`:
- Best case (0 findings): 2 rounds × 3 agents = 6 Agent calls
- Common case (1+ findings in round 1): 3+ rounds × 3 agents = 9+ Agent calls
- At ~30K tokens per reviewer response: 6 calls = ~180K tokens, 9 calls = ~270K tokens
- Plus debate overhead: ~50K per contested finding

`max_total_tokens: 500000` is sufficient for common case but tight.
`per_round_tokens: 250000` gives ~83K per reviewer per round (generous).

**MVP does NOT enforce token budgets** — budget fields in profile are advisory-only.
Token counting requires API-level instrumentation not available in prompt-only orchestration.
Budget enforcement is deferred to Phase 4 (requires integration with usage tracking).

### Estimated Size
- SKILL.md: ~350 lines (includes parsing strategy + cross-check instructions)
- Profiles: ~100 lines (2 profiles: _base + code-review; analysis-review uses _base directly)
- Prompts: ~100 lines (3 prompts for MVP: correctness, security, slop-detector; ~30 lines each)
- Total new files: ~550 lines + JSONL schema

NOTE: Previous estimate of ~650 included 5 prompts at ~40 lines each. MVP ships 3 prompts
at ~30 lines each (matching the examples in Section 9). Additional prompts added in Phase 2.

---

## 12. Test Strategy

### 12.1 Smoke Test
Invoke `/cross-review analysis-review "Review the cross-review-framework.md design document"`
- Expected: 3 reviewers spawn, reports collected, voting runs, result produced
- Verify: JSONL event log created, consolidated report matches format

### 12.2 Convergence Test
Run cross-review on a known-good document (e.g., one that passed 8 rounds)
- Expected: clean in 2 rounds (convergence)

### 12.3 Finding Detection Test
Inject a known issue into a document and run cross-review
- Expected: at least 2/3 reviewers catch it → CONFIRMED

### 12.4 Quality Signal Test
Create a reviewer prompt that produces vague, ungrounded output
- Expected: Tier 1 quality signals flag the reviewer

---

## 13. Implementation Questions

### Confirmed (resolved)
1. **Agent tool model parameter**: YES — `model: "sonnet"` / `"opus"` / `"haiku"` is supported. See Section 1.1.
2. **Parallel Agent calls**: YES — Claude Code supports multiple Agent() calls in one response.
3. **Report parsing reliability**: Addressed in Section 4.1 — regex-based extraction with fallback.

### Open (needs investigation during build)
4. **Agent tool timeout**: No documented timeout parameter on Agent(). Need to test: does the agent eventually return on its own? Mitigation: set `max_debate_rounds` low.
5. **Review target passing**: For large targets, pass file paths + summary (not full content). Reviewers use Read/Grep tools to access files independently. This reinforces the `must_read_source: true` requirement.
6. **Finding identity across rounds**: `no_vote_change` convergence requires comparing findings across rounds. Finding IDs are per-round. Resolution: match by (file, line, description_hash) — a finding in round N+1 is "the same" as round N if it references the same code location.
7. **Token budget enforcement**: Not possible in prompt-only orchestration. Advisory only in MVP. See "MVP Budget Reality Check" above.
