# Cross-Review Framework — Multi-Agent Mutual Verification System

> **GitHub Issue**: https://github.com/nextain/naia-os/issues/165
> **Scope**: AI agent review quality assurance — applicable to all review stages
> **Status**: Research & Design — CONVERGED (Round 8, 2× consecutive CLEAN)

Date: 2026-03-28

## 1. Problem Statement

Current iterative review has structural weaknesses:

1. **Self-review blindspot** — The author reviews their own work (same context, same biases)
2. **Unverified "clean" declarations** — Agent claims "0 findings" without actually reading files
3. **Context drift** — After long sessions, the main agent's context becomes corrupted (compaction, hallucination)
4. **No cross-check** — Single reviewer means single point of failure
5. **AI SLOP** — Agents produce confident-sounding but ungrounded analysis

## 2. Proposed Solution: Cross-Review Framework

### 2.1 Architecture

```
┌─ Cross-Review Framework (abstract protocol) ────────────┐
│                                                          │
│  Requester ←→ Reviewer A ←→ Reviewer B ←→ Reviewer C    │
│      ↕            ↕            ↕            ↕            │
│  All participants (Requester + R reviewers) mutually monitor each other │
│                                                          │
│  Fixed: Protocol (procedure, report format, flow)        │
│  Flexible: Everything else (via Profile)                 │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Core Protocol (Fixed)

These are invariant regardless of Profile configuration:

1. **Independent Review** — Each reviewer reads source independently (no shared context)
2. **Structured Report** — Every participant produces a report in a defined format
3. **Voting** — Independent findings aggregated by configured voting strategy (default)
4. **Selective Debate** — Only for contested/uncertain findings (not all findings)
5. **Health Check** — Any participant can flag another as degraded
6. **Dismissal Protocol** — Findings or participants can be dismissed with sufficient votes
7. **Loop Until Clean** — Repeat until consensus clean (per Profile policy)

> **Design rationale (Round 2 cross-check)**: Evidence shows debate gains are mostly
> from ensemble effect (Pham et al. 2025 "Debate or Vote", arXiv:2508.17536 —
> martingale argument over agent beliefs). Default to voting; debate only for uncertain
> items where cross-examination adds value (87-98% hallucination detection, Cohen et al.
> EMNLP 2023).

### 2.3 Profile (Flexible — all configurable)

```yaml
profile:
  name: "analysis-review"           # Profile identifier

  requester:
    role: "Investigator"            # Requester's role context

  reviewers:
    count: 3                        # Min 2. No upper limit.
    specs:
      - expertise: "Platform specialist"
        system_prompt: "..."
      - expertise: "SLOP detector"
        system_prompt: "..."
      - expertise: "Adversarial attacker"
        system_prompt: "..."

  consensus:
    strategy: "unanimous"           # unanimous | majority | supermajority | threshold
    # threshold: 3                  # For threshold strategy
    clean_rounds: 2                 # Consecutive clean rounds needed
    max_debate_rounds: 3            # Cap per ACL 2025 finding
    convergence: "all_agree"        # "all_agree" | "no_vote_change" | "ks_stability" (Phase 3+)
    # "no_vote_change": The set of CONFIRMED findings in Round N+1 is identical
    # to Round N (same finding IDs, same dispositions). New or removed findings
    # count as a change. Round 1 always counts as non-converged (no previous).

  limits:
    max_rounds: 10                  # Hard cap on total rounds (prevents infinite loop)
    round_timeout_seconds: 300      # Per-round timeout; hung reviewer → skip
    review_timeout_seconds: 1800    # Total review timeout

  dismissal:
    finding_dismissal: "unanimous_except_target"  # Who votes to dismiss a finding
    participant_dismissal: "unanimous_except_target"  # Who votes to remove a participant
    strikes_before_dismissal: 2     # Dismissed findings before removal eligible
    quorum:                         # Formal quorum constraints
      flag: 1                       # Min reviewers to flag a finding (Phase 2 uses majority)
      dismiss: "all_except_target"  # Votes needed to dismiss (string → resolved by registry)
      # Invariant: flag_quorum + dismiss_quorum >= total_reviewers
    replacement_policy: "spawn_fresh"  # "spawn_fresh" | "reuse_from_pool"

  health_check:
    strategy: "majority_except_target"  # Who can flag context drift
    triggers_refresh: true              # Force requester to re-read sources

  quality_signals:                  # Domain-specific "abnormality" definition
    claim_to_read_ratio: 3.0       # Max claims per file read (calibration needed)
    min_specificity: 0.3           # Min % of claims with file:line refs (calibration needed)
    min_verifiability: 0.7         # Min % of cited files/lines that exist (calibration needed)
    min_novelty: 0.5               # Min % of findings not in original prompt (calibration needed)
    # NOTE: These thresholds are engineering defaults, NOT empirically derived optima.
    # They should be calibrated per-project through initial runs.

  evidence_requirements:
    min_files_read: 3              # Min files reviewer must read per pass
    must_read_source: true         # Must Read actual source, not rely on summary

  cost:
    max_total_tokens: 500000       # Budget cap for entire review
    per_round_tokens: 250000       # Budget cap per round (must be > R × per_reviewer + Phase 2/3 overhead)
    per_reviewer_tokens: 50000     # Budget cap per reviewer per round (Phase 1 only)
    # NOTE: per_round_tokens covers Phase 1 (R × per_reviewer) + Phase 2 voting + Phase 3 debate.
    # Default 250K assumes R=3 (150K Phase 1) + ~100K Phase 2/3 overhead.
    # Adjust per_round_tokens when changing reviewer count.
    # Enforcement priority (innermost first):
    #   1. per_reviewer_tokens exceeded → reviewer completes current response, then stops
    #   2. per_round_tokens exceeded → skip Phase 3 debate, proceed to round result
    #   3. max_total_tokens exceeded → complete current round, skip remaining rounds,
    #      report partial results with BUDGET_EXCEEDED flag

  logging:
    event_log_path: ".agents/reviews/{review_id}.jsonl"  # Append-only event log
    # Event types with minimal required fields:
    # REVIEW_STARTED:       { review_id, profile, target, timestamp }
    # REVIEWER_SPAWNED:     { review_id, reviewer_id, expertise, model, timestamp }
    # REPORT_SUBMITTED:     { review_id, round, reviewer_id, verdict, findings_count, files_read[], timestamp }
    # FINDING_RAISED:       { review_id, round, reviewer_id, finding_id, severity, file, line, description }
    # FINDING_CONFIRMED:    { review_id, round, finding_id, supporters[] }
    # FINDING_DISMISSED:    { review_id, round, finding_id, reason }  (auto-dismiss, no strike)
    # FINDING_CONTESTED:    { review_id, round, finding_id, supporters[], challengers[] }
    # VOTE_CAST:            { review_id, round, voter_id, finding_id, vote, evidence }
    # AGENT_HEALTH_FLAGGED: { review_id, flagger_id, target_id, reason, health_score }
    # AGENT_DISMISSED:      { review_id, target_id, votes[], reason, replacement_id }
    # CONTEXT_DRIFT_DETECTED: { review_id, detector_id, evidence[] }
    # ROUND_COMPLETED:      { review_id, round, confirmed, dismissed, contested, clean_count }
    # REVIEW_COMPLETED:     { review_id, rounds_total, final_status, timestamp }

  model_policy:
    generation: "haiku"            # Cheap model for drafting/generating
    judgment: "sonnet"             # Capable model for voting/judging (NOT haiku)
    arbitration: "opus"            # Frontier model for dispute resolution
    # NOTE (Round 2 CC-3): Cheap models exhibit higher bias in judgment tasks.
    # Use at least Sonnet-tier for any evaluation/voting decision.

  diversity:
    model_heterogeneity: "recommended"  # Use different model families when possible
    # NOTE (Round 2 CC-3 Critical): Agents sharing training data may share biases.
    # Claude + GPT + Gemini prevents correlated consensus on wrong answers.
    strategy_diversity: "required"      # Different review strategies per agent (DMAD)
    # NOTE (R2): Reasoning method diversity > persona diversity
    # LIMITATION (R3-Adversarial): "required" is enforced at INPUT level only
    # (different system prompts). Output-level strategy diversity is not measured.
    # Mitigation: profile should define distinct system_prompt_ref per reviewer
    # that explicitly assign different review methodologies (line-by-line logic,
    # security pattern matching, architectural assessment, etc.)
```

### 2.4 Domain Profiles

| Profile | Reviewers | Consensus | Quality Focus |
|---------|-----------|-----------|---------------|
| `analysis-review` | Platform expert, Architect, SLOP detector | Unanimous, 2 clean | Source accuracy |
| `code-review` | Security, Cross-platform, SLOP detector | Unanimous, 2 clean | Correctness, safety |
| `test-review` | Edge-case hunter, Coverage analyst, SLOP detector | Majority, 2 clean | Completeness |
| `doc-review` | Accuracy checker, Consistency checker | Majority, 1 clean | Code-doc alignment |
| `security-review` | AppSec, Crypto, Pentest, SLOP detector, Risk analyst | Unanimous, 3 clean | Zero tolerance |
| `research` | Domain expert, Methodology critic, Source verifier | Majority, 2 clean | Depth, accuracy, novelty |
| `(custom)` | User-defined | User-defined | User-defined |

## 3. Review Flow

### 3.1 Normal Flow (3-Phase Hybrid)

> **Design rationale**: Independent review captures ensemble benefit (the real source of
> accuracy gains). Voting resolves clear consensus. Debate is reserved for uncertain items
> where it adds the most value. This ordering is supported by R2 (martingale proof),
> R6 (Cursor "aggressive then filter"), and CC-1 (cross-check validation).

```
Round N:
  Phase 1 — INDEPENDENT REVIEW (parallel):
    1. Requester submits review target + context
    2. All reviewers independently read source and review
       - Each uses a DIFFERENT review strategy (not just different persona)
    3. Each reviewer submits structured report
    NOTE: Reviewers are ISOLATED during Phase 1 (no shared findings).
    Findings become visible to all reviewers only at Phase 2 start
    (fully connected topology for cross-check, not during generation).
  Phase 2 — VOTING (reviewers only; Requester does NOT vote on confirmation):
    NOTE on Requester voting: Requester is EXCLUDED from Phase 2 confirmation
    voting but MAY vote on formal finding dismissal (Section 3.2) and
    participant dismissal (Section 3.3).

    4. FINDING MATCHING: Findings from different reviewers are matched by
       (file_path, line_range_overlap >= 1 shared line). Two findings referencing
       at least one common line in the same file = "about the same issue."
       Findings with no file:line reference are matched by stemmed-token
       Jaccard similarity > 0.5 (stopwords removed, Porter stemming applied).
       Implementation: simple token-level matching, not embedding-based.
       MULTI-MATCH RULE: One finding can match at most ONE finding from each
       other reviewer (greedy, by highest overlap). If A's finding overlaps
       with B's F1 and B's F2, pick the one with more overlapping lines.
       Ties broken by finding order. No many-to-many: 1-to-1 per reviewer pair.
       MULTI-FILE FINDINGS: A finding may reference multiple (file, line_range)
       pairs. Two findings match if they share overlap on ANY common file.
       Greedy tiebreaker uses sum of overlapping lines across all shared files.

    5. Classification (R = reviewer count):
       - ALL reviewers agree (R/R support) → CONFIRMED
       - R >= 3 AND only 1 reviewer, no match → AUTO-DISMISSED
         (Does NOT count as formal dismissal strike)
       - R = 2: auto-dismiss is SKIPPED (all non-unanimous → CONTESTED)
         Rationale: with only 2 reviewers, auto-dismissing unique findings
         would drop every non-consensus finding without debate.
       - Any other distribution → CONTESTED (goes to Phase 3)

       Examples:
         R=2: 2/2=CONFIRMED, 1/2=CONTESTED
         R=3: 3/3=CONFIRMED, 2/3=CONTESTED, 1/3=DISMISSED
         R=5: 5/5=CONFIRMED, 1/5=DISMISSED, 2-4/5=CONTESTED

       NOTE: CONFIRMED requires unanimity, not simple majority.
       This ensures Phase 3 debate triggers for ANY disagreement.
       Simple majority was found to make CONTESTED unreachable at R<=3 (Round 5).

  Phase 3 — SELECTIVE DEBATE (only for CONTESTED findings):
    6. Cross-examination: probing agent asks "What specific code triggers this?"
       Max 2-3 debate sub-rounds (more rounds hurt accuracy per ACL 2025)
    7. Post-debate vote on contested findings: simple majority ceil(R/2)
       EVEN-R TIE RULE: For even R, a tie (exactly R/2 votes each) results
       in CONFIRMED. Bias is intentionally toward surfacing findings rather
       than suppressing them — false negatives (missed bugs) are costlier
       than false positives (which formal dismissal can handle).
       DESIGN DECISION: Phase 3 intentionally uses a LOWER bar than Phase 2.
       Phase 2 unanimity ensures debate happens for any disagreement.
       Phase 3 majority allows resolution after debate has occurred.
       If debate changes no votes, the finding is confirmed with the same
       distribution that made it CONTESTED — this is by design, as the
       debate itself adds value (cross-examination, evidence presentation)
       even when votes don't change. The debate record is logged for audit.
       For R=2: Phase 3 majority = ceil(2/2) = 1, so the finding raiser's
       own vote confirms. This is acceptable: with R=2, formal dismissal
       (Section 3.2, requires Requester vote) is the override mechanism.

  ROUND RESULT:
    If 0 confirmed findings:
      clean_count += 1
      If clean_count >= profile.clean_rounds → REVIEW COMPLETE
      Else → Round N+1 (re-review to confirm)
    If confirmed findings exist:
      clean_count = 0
      Requester addresses findings → Round N+1
```

### 3.2 Finding Dismissal Flow

Formal dismissal is a SEPARATE mechanism from Phase 2/3 auto-classification.
It can be invoked AFTER Phase 3 debate concludes (not during).
If Phase 3 confirms a finding but a reviewer believes it is wrong,
they can invoke formal dismissal as an escalation path.

```
1. Reviewer A submits Finding X
2. Reviewer B challenges: "Finding X has no basis — file:line shows otherwise"
3. Vote: {B: dismiss, C: dismiss, Requester: dismiss} → 3/3 = DISMISSED
   - Finding X removed from active list
   - Reviewer A gets 1 strike
   - Strike reason recorded with evidence
4. If Reviewer A reaches strikes_before_dismissal → Participant Dismissal eligible
```

### 3.3 Participant Dismissal Flow

```
1. Reviewer A has 2 dismissed findings (strikes_before_dismissal reached)
2. Anyone motions: "Remove Reviewer A — repeated ungrounded claims"
3. Vote: {remaining participants except A}
4. If consensus met → A removed, replacement A' spawned
   - A's findings from the current round are DROPPED from the matching pool
   - A' receives: review target + A's dismissal history (for context)
   - A' runs Phase 1 INDEPENDENTLY first (no accumulated findings)
   - Phase 2 matching runs with {B, C, A'} reports only (A's reports excluded)
   - Accumulated findings from prior rounds shared with A' only at Phase 2 start
   - A' does NOT inherit A's context (fresh start, anti-anchoring)
```

### 3.4 Context Drift Detection Flow

```
1. Reviewer B detects: "Requester's analysis says browser.rs:61 has libc::kill
   outside cfg guard, but actual code shows it's now inside #[cfg(unix)] block"
2. Reviewer B verdict: REQUESTER_CONTEXT_DRIFT + evidence
3. If health_check threshold met (e.g., 2/3 reviewers agree):
   - Review PAUSED
   - Requester must re-read all cited files (enforced by hook)
   - Requester re-submits corrected analysis
   - Review resumes
```

## 4. Report Format

### 4.1 Reviewer Report

```markdown
## Review Pass {N} — Reviewer {ID} ({expertise})

**Scope**: {what was reviewed}

**Files read**:
- `{file}:{start}-{end}` — {reason}
- `{file}:{start}-{end}` — {reason}

**Checked**:
- [x] {check item} — {result with evidence}
- [x] {check item} — {result with evidence}

**Cross-check** (Round 2+):
- Reviewer {X} Finding {Y}: {AGREE|DISAGREE} — {evidence}

**Findings**: {N}
- [{severity}] {description} — `{file}:{line}` {evidence}

**Verdict**: {CLEAN | FOUND_ISSUES | REQUESTER_CONTEXT_DRIFT}
```

### 4.2 Consolidated Report

```markdown
## Cross-Review Round {N} Summary

**Participants**: Requester + {N} reviewers
**Consensus policy**: {strategy}

| Reviewer | Verdict | Findings | Files Read |
|----------|---------|----------|------------|
| A ({expertise}) | CLEAN/FOUND/DRIFT | N | N |
| B ({expertise}) | CLEAN/FOUND/DRIFT | N | N |
| C ({expertise}) | CLEAN/FOUND/DRIFT | N | N |

**Confirmed findings** (consensus): N
**Dismissed findings**: N
**Participant health**: all OK / {ID} flagged

**Round result**: {PASS — clean_count N/M | CONTINUE — issues to address}
```

## 5. "Abnormal" Agent Behavior — Definition & Detection

### 5.1 Measurable Signals (implementable as hooks)

**Tier 1 — Zero cost (local file operations only):**

| Signal | Formula | Threshold | What it catches |
|--------|---------|-----------|-----------------|
| Claim-to-Read Ratio | claimed_files / read_files | > 3.0 | Reading 1 file, claiming about 10 |
| Specificity Score | claims_with_file_line / total_claims | < 30% | Vague claims without evidence |
| Verifiability Score | existing_cited_refs / total_cited_refs | < 70% | Citing non-existent code |
| Prompt Echo Ratio | findings_identical_to_prompt / total | > 50% | Parroting the request back |
| Self-Contradiction | contradicting_claims_in_same_report | > 0 | Internal inconsistency |

**Tier 2 — Low cost (simple computation):**

| Signal | Formula | Threshold | What it catches |
|--------|---------|-----------|-----------------|
| Hedge Density | hedge_phrases / 100_words | > 3.0 | "It's worth noting", "arguably" |
| Cross-Agent Agreement | my_findings ∩ others / my_findings | < 30% sustained | Persistent outlier |
| Novelty Ratio | new_findings / total | < 50% | Repeating known information |
| Linguistic Burstiness | variance(sentence_lengths) | < threshold | Robotic uniformity |

**Tier 3 — Moderate cost (requires LLM or embedding):**

| Signal | Method | What it catches |
|--------|--------|-----------------|
| Semantic Consistency | NLI between claims | Self-contradicting within report |
| Groundedness | MiniCheck (770M, local) | Claims not supported by source |
| Self-Consistency | K=3 same-task rerun, majority vote | Unreliable on this specific task |

### 5.2 Agent Health Score (composite)

Uses Tier 1 + Tier 2 signals only (zero/low cost). Tier 3 is on-demand, not in composite.

All signals are NORMALIZED to 0.0-1.0 before weighting:
- Ratio signals (Claim-to-Read): `1.0 - min(ratio / threshold, 1.0)` (higher ratio → lower score)
- Proportion signals (Specificity, Verifiability, etc.): used as-is (already 0-1)
- Count signals (Hedge Density): `1.0 - min(count / threshold, 1.0)`

```
Score = (
  norm(Claim-to-Read)   × 0.15 +   # Tier 1, normalized
  Specificity            × 0.15 +   # Tier 1, already 0-1
  Verifiability          × 0.25 +   # Tier 1, already 0-1 (strongest signal)
  norm(Prompt Echo)      × 0.10 +   # Tier 1, normalized
  norm(Hedge Density)    × 0.10 +   # Tier 2, normalized
  Cross-Agreement        × 0.15 +   # Tier 2, already 0-1
  Novelty                × 0.10     # Tier 2, already 0-1
) × 100

Score < 50 → FLAG as potentially degraded
Score < 30 → AUTO-DISMISS (if profile allows)

NOTE: All signals are from the defined Tier 1/2 tables above.
Weights are engineering defaults — calibrate per-project.
"Tool Coherence" (prev. version) removed: redundant with Claim-to-Read ratio.
Self-Contradiction and Linguistic Burstiness excluded from composite
(used as supplementary flags, not scored).
```

## 6. Prior Art & Research Basis

### 6.1 Academic Foundations

| Approach | Source | Key Finding | Applied How |
|----------|--------|-------------|-------------|
| Multi-Agent Debate | Du et al. 2023 (MIT) | Independent review → mutual critique → convergence | Core review loop |
| Cross-Examination | Cohen et al. 2023 | Probing for contradictions reveals hallucination | Cross-check phase |
| AI Safety via Debate | Irving et al. 2018 (OpenAI) | Truth-telling is optimal strategy in debate | Theoretical basis |
| Self-Consistency | Wang et al. 2022 | K samples + majority vote improves accuracy | Multiple reviewers |
| BFT for LLM Agents | CP-WBFT 2025 | 85.7% fault tolerance on complete graphs with random (non-adversarial) faults; ensemble effect not isolated (CC-1 caveat) | Confidence-weighted voting concept |
| Voting vs Consensus | ACL 2025 | 2-3 debate rounds optimal; more rounds hurt | max_debate_rounds cap |
| Semantic Entropy | Nature 2024 | Meaning-level uncertainty detects hallucination | Health check signals |
| MiniCheck | 2024 | 770M model achieves GPT-4 fact-checking at 400x less cost | Verifiability scoring |
| Recursive Knowledge Synthesis | 2025 | Tri-agent heterogeneous validation until convergence | Cross-check design |

### 6.2 Production Systems

| System | Pattern | Relevance |
|--------|---------|-----------|
| HubSpot Sidekick | Judge agent filters review comments before posting | Finding quality gate |
| Qodo | 15+ specialized agents, 20K PRs/day | Domain specialization |
| CodeRabbit | Multi-pass with self-verification scripts | Multi-round review |
| AutoGen Code Review | 4 agents (Security, Style, Logic, Coordinator) | Role-based review |
| CrewAI PR Agent | Role-based with error recovery | Profile system |

### 6.3 What's New in Our Design

No existing system combines ALL of these:

1. **Mutual (R+1)-way health monitoring** (Requester + R reviewers, all monitor each other)
2. **Formal dismissal protocol** with strikes and replacement
3. **Context drift detection** (reviewers → requester direction)
4. **Fully abstract framework** (reviewer count, consensus, quality signals all configurable)
5. **Measurable "abnormality" definition** with tiered signals
6. **Profile system** for domain-specific configuration

## 7. Implementation Plan (Round 2 revised)

### Phase 1: MVP Core (~800-1200 lines)
> Round 2 CC-3 revised from 550 → 800-1200 lines based on actual codebase analysis.

- Profile loader + YAML validation (reject deferred options like ks_stability) (~100 lines)
- Reviewer spawning via Claude Code Agent tool with strategy-diverse system prompts (~150 lines)
  Mechanism: each reviewer is a parallel Agent(subagent_type="general-purpose") call.
  Isolation: each agent gets fresh context (no shared conversation).
  IPC: agent returns structured report as text; coordinator parses it.
- Report collection + structured parsing (~100 lines)
- Majority voting consensus (Strategy pattern) (~100 lines)
- 3-phase round manager (independent → vote → selective debate) (~200 lines)
- Event logging to JSONL (~50 lines)
- Simple convergence: "all agree" or "no vote change between rounds" (~50 lines)
  > KS adaptive stability deferred — underpowered at MVP scale (CC-3)
- Result-level generation counter (lightweight fencing) (~50 lines)
  > Full fencing tokens deferred — Gateway modification needed for side-effects (CC-3)
- Rolling z-score health monitor (~100 lines)
  > Phi Accrual deferred — cold-start problem (CC-3)
- Lightweight dismissal tracking: count per-reviewer dismissed findings per round (~50 lines)
  > If a reviewer's findings are dismissed > 2x in MVP, log warning + reduce weight
  > Full dismissal protocol (strikes, voting, replacement) deferred to Phase 2

### Phase 2: Cross-Check & Dismissal
- Finding cross-validation (cross-examination for contested items)
- Finding dismissal voting (quorum: flag + dismiss > total)
- Participant dismissal protocol (strikes → removal → replacement)

### Phase 3: Advanced Health Monitoring
- Tier 1 quality signals integration with process-guard
- Phi Accrual quality detector (requires calibration data from Phase 1+2)
- Context drift detection (REQUESTER_CONTEXT_DRIFT verdict)
- KS adaptive stability (for larger agent pools)

### Phase 4: Profile System & Integration
- YAML profiles with inheritance (Docker Compose `extends`)
- Built-in profiles for common review types
- Integration with existing harness hooks (process-guard, commit-guard)
- Cost management with model cascading (Haiku→Sonnet→Opus)
- MiniCheck integration for Tier 3 quality signals

## 8. Known Risks (Round 2 identified)

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Correlated bias = unfalsifiable consensus** — agents sharing training data agree on wrong answers | Critical | Model heterogeneity (Claude+GPT+Gemini), strategy diversity (DMAD) |
| 2 | **Phi Accrual cold-start** — no calibration data at deployment | High | Phase 1 uses rolling z-score; Phi Accrual in Phase 3 after data accumulates |
| 3 | **Cheap models bad at judgment** — Haiku-tier has high bias | High | Generation=Haiku, Judgment/Voting=Sonnet+, Arbitration=Opus |
| 4 | **Fencing incomplete** — cannot fence side-effects without Gateway changes | Medium | Result-level fencing only; read-only subagents where possible |
| 5 | **Quality signal thresholds unvalidated** — engineering defaults, not empirical | Medium | Mark as "calibration needed"; tune during Phase 1 usage |
| 6 | **41.5% all-tools pass rate** — AI review augments, doesn't replace | Medium | Pipeline: tools first → patterns → LLM → human. Never gate on AI alone. |
| 7 | **Token budget overrun** — multi-agent reviews can exceed budget | Medium | On budget exceeded: complete current round, skip remaining rounds, report partial results with "BUDGET_EXCEEDED" flag. Never abort mid-reviewer. |
| 8 | **Replacement reviewer anchoring** — A' receives accumulated findings, destroying independence | Medium | A' runs Phase 1 independently FIRST (no findings shared), then receives accumulated findings only in Phase 2. Minimizes anchoring. |

## 9. Open Questions

1. **Communication vs ensemble**: Does structured communication add value beyond better ensembling? Head-to-head test needed.
2. **Tier 1 catch rate**: What % of bad outputs does structural verification alone catch?
3. **Model independence**: Are Claude + GPT + Gemini actually independent, or do shared training data create correlated biases?
4. **Adversarial inputs**: What happens with code designed to exploit LLM blind spots? Need hard round cap.
5. **Memory across sessions**: Should reviewer dismissal history persist across sessions?
6. **Integration with verify-* skills**: Should existing verify skills become reviewers, or remain separate?

## 10. Research Trail

Full research process documented in:
- **Meeting minutes**: `docs/reports/20260328-multi-agent-research-minutes.md`
- **R5 source analysis**: `docs/reports/20260328-multi-agent-framework-source-analysis.md`
- **8 research agents** (Round 1) + **3 cross-check agents** (Round 2)
