---
name: cross-review
description: Multi-agent cross-review — spawn independent reviewers, collect structured reports, vote on findings, selectively debate contested items, and iterate until convergence. Implements the Cross-Review Framework (Issue #165).
disable-model-invocation: false
argument-hint: "<profile-name> <review-target-description>"
---

# Cross-Review

Multi-agent mutual verification. Reviewers independently analyze the same target,
then cross-check each other's findings through voting and selective debate.

## Step 1: Parse Arguments

Parse the user's invocation: `/cross-review <profile> <target>`

- **profile**: Name of a profile file in `.agents/profiles/` (default: `code-review`)
- **target**: Description of what to review (file paths, analysis document, PR description, etc.)

If no arguments: ask the user for profile and target.

## Step 2: Load Profile

1. Read `.agents/profiles/{profile}.yaml`
   - If the file does not exist: report `Profile not found: .agents/profiles/{profile}.yaml` and **stop**.
   - If the file is not valid YAML: report `Profile parse error: {error details}` and **stop**.
2. If the profile has `metadata.extends`: read the parent profile, deep-merge (child overrides parent).
   For MVP: if extends `_base`, read `.agents/profiles/_base.yaml` and merge manually.
   - If the parent profile does not exist: report `Parent profile not found: {parent}` and **stop**.
3. For each reviewer spec with `prompt_ref`: verify `.agents/prompts/{prompt_ref}` exists.
   - If a prompt file is missing: report `Prompt not found: .agents/prompts/{prompt_ref}` and **stop**.
4. Validate:
   - `spec.reviewers.count >= 2`
   - `spec.reviewers.specs` has exactly `count` entries (if present)
   - Each reviewer spec has `id`, `expertise`, `prompt_ref`, `strategy`
   - `spec.consensus.clean_rounds >= 1`
   - `spec.limits.max_rounds >= 1`

If validation fails, report specific errors (which field, expected vs actual) and **stop**.
Do not proceed to Step 3 with a partially loaded or invalid profile.

## Step 3: Initialize Review

1. Generate review_id: `cr-{YYYYMMDD}-{HHmm}` (e.g., `cr-20260328-1430`)
2. Create event log file: `.agents/reviews/{review_id}.jsonl`
3. Log event:
   ```json
   {"type":"REVIEW_STARTED","review_id":"{id}","profile":"{name}","target":"{description}","timestamp":"{ISO}"}
   ```
4. Display to user:
   ```
   ## Cross-Review Initialized

   **Review ID**: {review_id}
   **Profile**: {profile_name}
   **Target**: {target_description}
   **Reviewers**: {count} ({id1}: {expertise1}, {id2}: {expertise2}, ...)
   **Consensus**: {strategy}, {clean_rounds} clean rounds needed
   **Max rounds**: {max_rounds}

   Starting Round 1...
   ```

## Step 4: Round Loop

For each round (1 to `spec.limits.max_rounds`):

### Phase 1 — Independent Review (PARALLEL)

For each reviewer in `spec.reviewers.specs`:

1. Read the reviewer's system prompt: `.agents/prompts/{prompt_ref}`
2. Construct the full reviewer prompt:

   ```
   {system_prompt content from the .md file}

   ## Your Review Target

   {target description from the user}

   ## Evidence Requirements

   - You MUST read at least {min_files_read} source files using the Read tool
   - You MUST read actual source code, not rely on summaries
   - Review strategy: {strategy from reviewer spec}

   ## Report Format (MUST follow exactly)

   ## Review Pass {round} — Reviewer {id} ({expertise})

   **Scope**: {describe what you reviewed}

   **Files read**:
   - `{file}:{start}-{end}` — {why you read this file}

   **Checked**:
   - [x] {what you checked} — {result with evidence}

   {if round >= 2 and previous_findings exist:}
   **Cross-check of previous findings**:
   - Finding {id}: {AGREE|DISAGREE} — {evidence from your own reading}

   **Findings**: {count}
   - [{CRITICAL|HIGH|MEDIUM|LOW}] {description} — `{file}:{line}` {evidence}

   **Quality signals** (SLOP detector only):
   - Claim-to-Read ratio: {value}
   - Specificity score: {value}
   - Verifiability score: {value}

   **Verdict**: {CLEAN | FOUND_ISSUES | REQUESTER_CONTEXT_DRIFT}
   ```

3. Spawn the reviewer using the **Agent** tool:
   - **Model cascading** (per `spec.model_policy` in profile):
     - Phase 1 (Independent Review): use `judgment` tier (default: `"sonnet"`)
     - Phase 3 (Selective Debate): use `arbitration` tier (default: `"opus"`)
     - Generation tasks (drafting, summarizing): use `generation` tier (default: `"haiku"`)
   - Each reviewer is a SEPARATE Agent call with independent context
   - **Spawn ALL reviewers in a SINGLE message** (parallel execution)
   - Each Agent call includes the constructed prompt above
   - If the Agent tool is unavailable, fall back to sequential inline review
     (ask the main agent to role-play each reviewer one at a time)

4. Log events for each reviewer:
   ```json
   {"type":"REVIEWER_SPAWNED","review_id":"{id}","reviewer_id":"{reviewer_id}","expertise":"{expertise}","model":"{spec.model_policy.judgment}","timestamp":"{ISO}"}
   ```

5. Collect all reviewer reports when agents complete.

### Phase 2 — Voting

For each collected report:

1. **Parse the report** — extract structured data:
   - Verdict: search for line starting with `**Verdict**:` — extract CLEAN/FOUND_ISSUES/DRIFT
   - Findings: search for lines matching `- [{severity}] {description} — \`{file}:{line}\``
   - Files read: search for lines under `**Files read**:` matching `` `{file}:{start}-{end}` ``
   - Finding count: from `**Findings**: {N}` — cross-validate with actual count

   If parsing fails for a report, log `PARSE_WARNING` and treat as CLEAN with 0 findings.

2. **Quality signal check** (Tier 1 + Tier 2, for each reviewer):

   **Tier 1 — Zero cost (from report structure):**
   - **Claim-to-Read Ratio**: `files_referenced_in_findings / files_in_files_read_section`.
     Threshold: > 3.0 (claiming about many files but reading few).
   - **Specificity Score**: `findings_with_file_line / total_findings`.
     Threshold: < 0.30 (vague claims without `file:line` evidence).
   - **Verifiability Score**: For each finding citing `file:line`, read the actual line
     and check if the cited content matches the finding description.
     Score = `verified_citations / total_citations`. Threshold: < 0.70.
   - **Prompt Echo Ratio**: `findings_identical_to_review_target_description / total_findings`.
     Threshold: > 0.50 (parroting the request back).

   **Tier 2 — Low cost (from report text):**
   - **Hedge Density**: Count hedge phrases ("it's worth noting", "arguably", "consider",
     "might", "potentially", "perhaps") per 100 words of findings text.
     Threshold: > 3.0 per 100 words.
   - **Cross-Agent Agreement**: After finding matching (step 4), compute
     `matched_findings / total_findings` for this reviewer. Threshold: < 0.30 sustained
     for 2+ consecutive rounds.
   - **Novelty Ratio**: (Round 2+ only) `new_findings_not_in_previous_round / total_findings`.
     Threshold: < 0.50 (repeating known findings without new analysis).

   **Composite Health Score** (per reviewer, per round):
   ```
   Normalize each signal to 0.0-1.0:
   - Ratio signals: 1.0 - min(value / threshold, 1.0)
   - Proportion signals: value as-is (already 0-1)

   Score = (
     norm(Claim-to-Read)  × 0.15 +
     Specificity           × 0.15 +
     Verifiability         × 0.25 +
     norm(Prompt Echo)     × 0.10 +
     norm(Hedge Density)   × 0.10 +
     Cross-Agreement       × 0.15 +
     Novelty               × 0.10
   ) × 100
   ```

   **Actions based on score:**
   - Score >= 50: OK (no action)
   - Score 30-49: log `AGENT_HEALTH_WARNING` with signal breakdown, continue
   - Score < 30: log `AGENT_HEALTH_FLAGGED`, eligible for auto-dismissal if profile allows
     (`spec.health_check.auto_dismiss_on_low_score: true`, default: false)

   Log per-reviewer health:
   ```json
   {"type":"HEALTH_SCORE","review_id":"{id}","round":{n},"reviewer_id":"{rid}","score":{n},"signals":{"claim_to_read":{v},"specificity":{v},"verifiability":{v},"prompt_echo":{v},"hedge_density":{v},"cross_agreement":{v},"novelty":{v}}}
   ```

3. Log events:
   ```json
   {"type":"REPORT_SUBMITTED","review_id":"{id}","round":{n},"reviewer_id":"{rid}","verdict":"{v}","findings_count":{n},"files_read":[...],"timestamp":"{ISO}"}
   ```

4. **Match findings** across reviewers:
   - Collect all findings from all reports
   - For each pair of findings from different reviewers:
     - If they reference the same file AND have overlapping line ranges (>= 1 shared line): MATCH
     - For multi-file findings: match if ANY common file has line overlap
   - Sort all potential matches by overlap score DESCENDING (greedy best-first)
   - Assign matches 1-to-1 per reviewer pair (no finding matches twice with same reviewer)
   - For findings without file:line references: match findings that describe the same issue
     based on semantic judgment (do they reference the same concept, same code area, same concern?)
   - Remaining unmatched findings are "solo"

5. **Classify** each matched group (R = number of reviewers who submitted reports this round,
   NOT the configured count — accounts for timeouts):
   - ALL R reviewers agree → **CONFIRMED**
   - R >= 3 AND only 1 reviewer, no match → **AUTO-DISMISSED** (no strike)
   - R = 2 AND only 1 reviewer → **CONTESTED** (auto-dismiss skipped for R=2)
   - Any other distribution → **CONTESTED**

6. Log finding events:
   ```json
   {"type":"FINDING_CONFIRMED","review_id":"{id}","round":{n},"finding_id":"{fid}","supporters":[...]}
   {"type":"FINDING_DISMISSED","review_id":"{id}","round":{n},"finding_id":"{fid}","reason":"auto-dismiss (solo, R>=3)"}
   {"type":"FINDING_CONTESTED","review_id":"{id}","round":{n},"finding_id":"{fid}","supporters":[...],"challengers":[...]}
   ```

### Phase 3 — Selective Debate (only if CONTESTED findings exist)

For each CONTESTED finding:

1. Spawn a cross-examination agent (using Agent tool, model: `spec.model_policy.arbitration` from profile, default: opus):
   - Provide the contested finding + all reviewers' positions on it
   - Ask: "Examine this finding. Read the cited source code. Is the finding valid?
     What specific code path/input triggers the issue? Provide concrete evidence."
   - Max sub-rounds: `spec.consensus.max_debate_rounds` from profile (default: 3)

2. After examination, take a final vote among the original reviewers:
   - Simple majority: `ceil(R/2)` votes to confirm
   - For even R, a tie (R/2 each) → CONFIRMED (bias toward surfacing findings)
   - For R=2: `ceil(2/2) = 1`, so the finding raiser's vote confirms alone.
     This is by design — for R=2, formal dismissal (Section 3.2 of framework doc) is the override.

3. Log votes:
   ```json
   {"type":"VOTE_CAST","review_id":"{id}","round":{n},"voter_id":"{vid}","finding_id":"{fid}","vote":"confirm|dismiss","evidence":"{text}"}
   ```

### Round Result

0. **Context Drift Check (Phase 3)**: Before counting findings, check if any reviewer
   reported `REQUESTER_CONTEXT_DRIFT` as their verdict.
   - If 1+ reviewers report DRIFT:
     - Log: `{"type":"CONTEXT_DRIFT_DETECTED","review_id":"{id}","round":{n},"detector_ids":[...],"evidence":[...]}`
     - Display warning to user:
       ```
       ⚠ Context drift detected by {reviewer_ids}.
       Evidence: {evidence from reviewer reports}
       Recommendation: Re-read the review target and refresh context before continuing.
       Continue with current context? [y/n]
       ```
     - If user says no: pause review, allow requester to refresh, then resume from Round N+1
     - If user says yes: continue normally (drift acknowledged but not acted on)
   - A reviewer should report DRIFT when they observe that the review target description
     or the requester's responses reference code/state that does not match actual files
     (e.g., requester describes a function that was renamed or deleted).

1. Count total CONFIRMED findings (from Phase 2 + Phase 3)

2. **Strike Accumulation (Phase 2)**: After Phase 2 voting, for each FINDING_DISMISSED
   where the finding was auto-dismissed (solo, R>=3), check domain relevance (see Appendix 8A)
   and increment `strike_count[reviewer_id]` only for domain-inconsistent findings.
   If `strike_count[reviewer_id] >= spec.dismissal.strikes_before_dismissal` (default: 2):
   - Log AGENT_HEALTH_FLAGGED with `dismissed_findings[]` list
   - **Dismissal vote**: The orchestrator (main agent) evaluates whether the
     reviewer's dismissed findings are genuinely off-topic/ungrounded by reading
     the dismissed findings and the actual source code. No re-spawning of reviewers
     needed — the orchestrator acts as the voting authority alongside the Requester.
   - If dismiss: log AGENT_DISMISSED, spawn replacement for Round N+1
     (A' receives target + confirmed findings only, no dismissed/history)
   - If keep: log VOTE_CAST with vote "keep", continue
   See **Appendix: Dismissal Protocol** below for full detail.

   **ALL_REVIEWERS_FLAGGED**: If every reviewer has ≥1 auto-dismissed solo AND 0 confirmed:
   Display warning, wait for user confirmation before proceeding.

3. If **0 confirmed findings**:
   - `clean_count += 1`
   - If `clean_count >= spec.consensus.clean_rounds`:
     → **REVIEW COMPLETE** — go to Step 5
   - Else:
     → Display "Round {n}: CLEAN ({clean_count}/{clean_rounds}). Running confirmation round..."
     → Continue to next round

4. If **confirmed findings > 0**:
   - `clean_count = 0`
   - Display the consolidated report (see Step 5 format) with all confirmed findings
   - **STOP and wait for user response**
   - User addresses findings, then says to continue
   - → Continue to next round

5. If `round >= spec.limits.max_rounds`:
   → **REVIEW COMPLETE** (max rounds reached) — go to Step 5

5b. **Budget check (advisory)**: After each round, estimate token usage from agent
   response lengths. Track `estimated_tokens_this_round` and `estimated_tokens_total`.
   - If `estimated_tokens_total > spec.cost.max_total_tokens`:
     → Log `{"type":"BUDGET_EXCEEDED","review_id":"{id}","round":{n},"estimated_tokens":{n}}`
     → **REVIEW COMPLETE** (budget exceeded) — go to Step 5 with status BUDGET_EXCEEDED
   - If `estimated_tokens_this_round > spec.cost.per_round_tokens`:
     → Skip Phase 3 debate for this round, proceed directly to Round Result
     → Log advisory warning
   NOTE: Token counts are estimates (response length × ~1.3). Exact counts require
   API-level instrumentation not available in prompt-only orchestration.

6. Log:
   ```json
   {"type":"ROUND_COMPLETED","review_id":"{id}","round":{n},"confirmed":{n},"dismissed":{n},"contested":{n},"clean_count":{n}}
   ```

### Health Monitoring (lightweight, per round)

After each round, check per-reviewer health:
- Count how many of this reviewer's findings were AUTO-DISMISSED in this review (across all rounds)
- If > 2 findings dismissed: display warning:
  ```
  ⚠ Reviewer {id} has {n} dismissed findings. Review quality may be degraded.
  ```
- This is advisory only in MVP. Formal dismissal protocol is Phase 2.

## Step 5: Report

Produce the final consolidated report:

```markdown
## Cross-Review Complete

**Review ID**: {review_id}
**Profile**: {profile_name}
**Rounds**: {total_rounds}
**Result**: {CLEAN | FOUND_ISSUES | MAX_ROUNDS_REACHED | BUDGET_EXCEEDED}

### Reviewer Summary

| Reviewer | Expertise | Verdict | Findings | Confirmed | Dismissed | Files Read |
|----------|-----------|---------|----------|-----------|-----------|------------|
| {id} | {expertise} | {verdict} | {n} | {n} | {n} | {n} |

### Confirmed Findings (requires action)

| # | Severity | Description | File:Line | Confirmed By |
|---|----------|-------------|-----------|-------------|
| 1 | {sev} | {desc} | `{file}:{line}` | {reviewer_ids} |

### Dismissed Findings (informational)

| # | Description | Reviewer | Reason |
|---|-------------|----------|--------|
| 1 | {desc} | {id} | Auto-dismissed (solo) |

### Health Summary

| Reviewer | Health Score | Dismissed Count | Strike Count | Status |
|----------|:-----------:|:--------------:|:------------:|--------|
| {id} | {score}/100 | {n} | {n} | OK / ⚠ Warning / 🚫 Dismissed |

### Cost Summary (advisory)

| Metric | Value |
|--------|-------|
| Total rounds | {n} |
| Estimated tokens (total) | ~{n} |
| Budget (max_total_tokens) | {n} |
| Model usage | Phase 1: {judgment}, Phase 3: {arbitration} |

**Event log**: `.agents/reviews/{review_id}.jsonl`
```

Log final event:
```json
{"type":"REVIEW_COMPLETED","review_id":"{id}","rounds_total":{n},"final_status":"{status}","timestamp":"{ISO}"}
```

## Appendix: Dismissal Protocol Detail (Phase 2)

This appendix documents the dismissal protocol triggered during Round Result (Step 4).
It is reference detail — the actual trigger is in Step 4 item 2 (Strike Accumulation).

### 8A. Strike Accumulator

Maintain a `strike_count` map (reviewer_id → count), initialized at REVIEW_STARTED.

After Phase 2 voting in each round:
- For every FINDING_DISMISSED event where the finding was auto-dismissed (solo, R>=3):
  - **Domain relevance check**: Before incrementing, evaluate whether the finding is
    within the reviewer's assigned domain (per `expertise` and `strategy` in profile).
    A security reviewer's solo security finding is domain-consistent even if no other
    reviewer corroborates it (other reviewers may lack security expertise).
    - If the finding is **domain-consistent**: do NOT increment strike. Log with
      `"strike_incremented": false, "reason": "domain-consistent solo finding"`.
    - If the finding is **domain-inconsistent** (e.g., accessibility finding from a
      security reviewer, or nation-state threat on a known-good config): increment
      `strike_count[reviewer_id]` by 1. Log with `"strike_incremented": true`.
  - A finding is domain-inconsistent when it references concerns outside the reviewer's
    `expertise` field, OR when it applies a threat model significantly beyond the
    profile's intended scope (e.g., nation-state threats in a standard code review).

NOTE: Confirmed findings are EXCULPATORY — they do NOT increment strikes.
Default threshold: `spec.dismissal.strikes_before_dismissal` (default: 2 from _base.yaml).

The health check fires **ONCE after ALL findings in a round are processed** —
not after each individual finding. Only domain-inconsistent auto-dismissals contribute
to strike_count before the check runs. The dismissal vote executes between Round N
result and Round N+1 start — never mid-round.

### 8B. Dismissal Vote

If `strike_count[reviewer_id] >= strikes_before_dismissal`:

1. Log: `{"type":"AGENT_HEALTH_FLAGGED", "review_id":"{id}", "flagger_id":"protocol", "target_id":"{reviewer_id}", "reason":"strike_count {n} >= threshold {t}", "dismissed_findings": [...]}`

2. Announce to user:
   ```
   ⚠ Reviewer {id} has {n} dismissed findings (threshold: {t}).
   Dismissal vote: should this reviewer be removed?
   Eligible voters: all participants EXCEPT {id} (the target).
   ```

3. **Vote collection (orchestrator-driven)**:
   The main agent (orchestrator) evaluates the dismissal by:
   - Reading the dismissed findings and comparing against actual source code
   - Checking if the findings are genuinely off-topic, ungrounded, or hallucinated
   - Making a DISMISS or KEEP recommendation to the Requester (user)
   - Requester confirms or overrides
   NOTE: No re-spawning of reviewer agents needed. The orchestrator has all
   findings in context and can evaluate quality directly.

4. If DISMISS (orchestrator + Requester agree) → proceed to 8C (Replacement)
   If KEEP → log VOTE_CAST events with `vote: "keep"`, continue with reviewer unchanged

### 8C. Replacement

1. Log: `{"type":"AGENT_DISMISSED", "review_id":"{id}", "target_id":"{reviewer_id}", "votes":[...], "reason":"...", "replacement_id":"{new_id}"}`

2. Spawn replacement reviewer A':
   - A' receives: **review target + confirmed findings list** (no dismissal history,
     no dismissed/contested findings — anti-anchoring)
   - A' uses the SAME profile reviewer spec (expertise, prompt_ref, strategy)
     but gets a fresh context (no predecessor state)
   - A' participates from **Round N+1** (not the current round)
   - A's prior reports from Round N are EXCLUDED from Round N+1 matching pool

3. Continue review loop with replacement in the next round.

### 8D. ALL_REVIEWERS_FLAGGED Guard

If in ANY round: every reviewer has ≥1 auto-dismissed solo finding AND 0 confirmed findings:
- Log: `{"type":"ALL_REVIEWERS_FLAGGED", "review_id":"{id}", "round":{n}}`
- Display: `⚠ ALL reviewers produced only dismissed findings. Review quality uncertain. Continue? [y/n]`
- Wait for user confirmation before proceeding

### 8E. Formal Finding Dismissal (post-Phase 3)

After Phase 3 debate, if a reviewer believes a CONFIRMED finding is wrong:
1. Challenger invokes formal dismissal per framework Section 3.2
2. Eligible voters: all participants EXCEPT the finding's raiser
3. Vote: DISMISS or KEEP (quorum: `spec.dismissal.finding_dismissal`)
4. If DISMISSED: finding removed, raiser gets 1 strike
5. If KEPT: finding remains confirmed, no strike

## Step 6: Cleanup

- If the review found issues, suggest next steps:
  ```
  ### Next Steps
  1. Address the {n} confirmed findings above
  2. Run `/cross-review {profile} {target}` again to verify fixes
  ```
- If CLEAN:
  ```
  ### Result
  All reviewers agree: no issues found. Review converged in {n} rounds.
  ```

---

## Exceptions

The following are NOT problems:

1. **Parser fallback** — If a reviewer's report doesn't follow the exact format, extract what you can and log a warning. Do not fail the entire review.
2. **Reviewer timeout** — If an Agent call takes too long, skip that reviewer for this round and note it in the report. Continue with available reviewers (minimum 2 required).
3. **All findings dismissed** — This is a valid outcome (CLEAN round). Dismissed findings are low-confidence solo findings that no other reviewer corroborated.
4. **R=2 Phase 3 auto-confirm** — With 2 reviewers, contested findings are confirmed by the raiser's vote. This is by design. The formal dismissal protocol (Phase 2+) provides the override.

## Harness Hook Integration

The following existing hooks integrate naturally with cross-review:
- **process-guard.js**: Blocks "clean pass" declarations without file reads — applies to orchestrator
- **commit-guard.js**: Checks progress file phase — cross-review runs during `review` phase

No hook modifications needed. Cross-review operates within the existing harness framework.

## Related Files

| File | Purpose |
|------|---------|
| `.agents/plans/cross-review-framework.md` | High-level design (converged) |
| `.agents/plans/cross-review-implementation-design.md` | Implementation design (converged) |
| `.agents/plans/cross-review-phase2-dismissal-plan.md` | Phase 2 dismissal investigation plan |
| `.agents/plans/cross-review-test-plan.md` | Test plan (23 test cases) |
| **Profiles** | |
| `.agents/profiles/_base.yaml` | Base profile (inherited by all) |
| `.agents/profiles/code-review.yaml` | Code review (3 reviewers, unanimous) |
| `.agents/profiles/analysis-review.yaml` | Analysis/investigation review |
| `.agents/profiles/security-review.yaml` | Security audit (4 reviewers, 3 clean rounds) |
| `.agents/profiles/research-review.yaml` | Research review (majority consensus) |
| `.agents/profiles/doc-review.yaml` | Documentation review (2 reviewers, lightweight) |
| **Reviewer Prompts** | |
| `.agents/prompts/correctness.md` | Line-by-line logic analysis |
| `.agents/prompts/security-expert.md` | Pattern-based security scan |
| `.agents/prompts/slop-detector.md` | Claim verification + quality signals |
| `.agents/prompts/platform-specialist.md` | Source verification |
| `.agents/prompts/reasoning-auditor.md` | Argument chain analysis |
| `.agents/prompts/threat-modeler.md` | Attack surface enumeration |
| **Test Fixtures** | |
| `.agents/tests/fixtures/injected-bugs/` | Injected bug files (5) for detection rate |
| `.agents/tests/fixtures/known-good/` | Known-good files for FP rate |
| `.agents/tests/fixtures/malformed-reports/` | Malformed reports for parse testing |
| `.agents/tests/fixtures/malformed-profiles/` | Invalid profiles for TC-5.3 |
| **Test Personas** | |
| `.agents/prompts/bad-reviewer-a-domain-amnesiac.md` | WCAG expert on Rust code |
| `.agents/prompts/bad-reviewer-b-scope-constrained.md` | Lines 1-20 only |
| `.agents/prompts/bad-reviewer-c-overcautious.md` | Nation-state threat model |
| `.agents/profiles/phase2-test.yaml` | Phase 2 test (Persona A) |
| `.agents/profiles/phase2-test-b.yaml` | Phase 2 test (Persona B) |
| `.agents/profiles/phase2-test-c.yaml` | Phase 2 test (Persona C) |
| **Reports** | |
| `docs/reports/cross-review-test-results-phase-*.md` | Test result reports |
| `.agents/reviews/` | Event logs (gitignored) |
