# Cross-Review Framework — Phase 2: Dismissal Protocol Investigation Plan

> **Parent**: `.agents/plans/cross-review-framework.md` (design) + `.agents/plans/cross-review-test-plan.md` (Phase 1 tests)
> **GitHub Issue**: https://github.com/nextain/naia-os/issues/165
> **Status**: Investigation Plan — Draft
> **Phase**: Phase 2 Dismissal Protocol

Date: 2026-03-28

---

## 0. Context: What Phase 1 Testing Actually Showed

Before designing Phase 2, record the exact empirical baseline from Phase A–D test runs.

### 0.1 Phase 1 Test Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Detection rate (injected bugs) | ≥ 60% | **100%** (5/5) |
| False positive rate (known-good) | ≤ 20% | **0%** (0/3) |
| Natural convergence rate | ≥ 90% | **100%** (3/3) |
| Parse failure rate | ≤ 10% | **0%** |
| Reviewer overlap (strategy diversity) | low | **0–5.6%** (correctness ∩ security) |
| Multi vs single improvement | ≥ +15% | **PENDING** (Phase E not run) |

### 0.2 TC-2.1 Critical Result: Claude Resists Being Bad

**TC-2.1 (Malformed Reviewer)** was designed to test the `PARSE_WARNING` fallback by giving one reviewer the `bad-reviewer.md` prompt:

```
"Do NOT follow any report format... Write vaguely... Do NOT read any actual files..."
```

**Result**: **FAIL**. Claude produced a fully structured report with `[HIGH]`/`[MEDIUM]`/`[LOW]` brackets and specific `Line 12:` references anyway. The helpfulness bias completely overrode the instruction.

**Implication for Phase 2**: A "be a bad reviewer" instruction is not a viable test strategy. Phase 2 must use _naturally occurring_ bad output through structural constraints, domain mismatch, or scope manipulation — not explicit instructions to fail.

### 0.3 Smoke Test Auto-Dismissals (Round 1, review cr-20260328-1400)

The original smoke test on `tauri.conf.windows.json` produced 4 auto-dismissed solo findings:

| Finding ID | Description | Dismissed because |
|------------|-------------|-------------------|
| F-006 | `tauri.conf.linux.json` missing | Out of scope (separate issue) |
| F-007 | Code signing configuration | Out of scope (base config) |
| F-008 | Deep link CSRF | Out of scope (base config) |
| F-009 | Asset scope | Out of scope (base config) |

**Pattern**: All 4 dismissed findings were **real valid concerns** about the codebase — but **wrong scope for this review target** (a Windows-overlay config file). This is the most concrete "bad finding" pattern we have observed: the finding is technically correct but irrelevant to the specific review target.

This is structurally different from hallucinated or fabricated findings. Phase 2 must handle both:
1. **Scope-overflow findings** — valid concern, wrong target (observed in smoke test)
2. **Hallucinated findings** — claims about code that does not exist (theoretical, not yet observed naturally)
3. **Overcautious findings** — every possible risk flagged regardless of context (not yet observed)

---

## 1. Real SLOP Pattern Catalog

### 1.1 Patterns Observed in This Session

These are empirically grounded patterns from actual Phase 1 runs, not hypothetical.

**SLOP-P1: Scope Overflow**
- Observed: 4/16 findings in smoke test (25%) were out-of-scope
- Mechanism: Reviewer reads the file correctly, finds a real issue, but the issue belongs to a different file or a different review scope
- Signal: Finding has no matching `file:line` in the specified target; finding references a parent config that is not under review
- Detection: Claim-to-Read ratio will be normal; Verifiability Score will be high (the code exists); but target-scope check will fail
- Example: `tauri.conf.linux.json missing` when reviewing the Windows overlay

**SLOP-P2: Structural Parroting (Hypothetical, not yet observed)**
- Mechanism: Reviewer repeats back findings from the review request or from another reviewer without independent verification
- Signal: High Prompt Echo Ratio (> 50% of findings are verbatim or near-verbatim from the review target description)
- Detection: Specificity Score may be high (citations copied from prompt), but Novelty Ratio will be low

**SLOP-P3: Hedge Cascade (Partially observed)**
- Observed: `bad-reviewer.md` fixture attempts to produce this, but Claude overrides it
- Mechanism: Findings consist entirely of qualified language ("consider", "might", "arguably") without specific code references
- Signal: Hedge Density > 3.0 per 100 words; Specificity Score < 30%
- Detection: Tier 1 + Tier 2 composite health score drops below 50

**SLOP-P4: Cross-Domain Contamination (Natural bad reviewer strategy)**
- Mechanism: A reviewer with the wrong domain expertise reviews code outside their knowledge
- Example: A CSS/styling expert reviewing Rust cryptographic code
- Signal: Findings cite correct line numbers but describe wrong semantics (e.g., "this variable naming is inconsistent" on a security-critical buffer)
- Detection: Low Cross-Agent Agreement (< 30% of findings confirmed by other reviewers)

**SLOP-P5: Context Drift / Stale Cache (Hypothetical — theoretical basis from R7)**
- Mechanism: Reviewer builds up a wrong model of the codebase across rounds and starts making claims about stale state
- Signal: Cited line numbers exist but content has changed; Verifiability Score drops in later rounds
- Detection: Verifiability Score degrades monotonically across rounds (Round N+1 < Round N)

**SLOP-P6: Confidence Laundering**
- Observed: TC-2.2 concern raised in test design (not triggered naturally)
- Mechanism: Reviewer cannot verify a claim but agrees with another reviewer's finding to appear authoritative
- Signal: Reviewer cites a finding as AGREE but has not read the cited file; no mention of file in their own `**Files read**` section
- Detection: Cross-reference AGREE votes against reviewer's own `**Files read**` list

### 1.2 Pattern Severity Matrix

| Pattern | Frequency (observed) | Harm | Detectability |
|---------|---------------------|------|---------------|
| P1: Scope Overflow | **High** (25% in smoke test) | Low (auto-dismissed correctly) | Easy (scope check) |
| P2: Structural Parroting | Not yet observed | High | Medium (Novelty Ratio) |
| P3: Hedge Cascade | Low (Claude resists) | Medium | Easy (Hedge Density) |
| P4: Cross-Domain Contamination | Not yet observed | Medium | Hard (requires domain knowledge) |
| P5: Context Drift | Not yet observed | High | Medium (Verifiability trend) |
| P6: Confidence Laundering | Not yet observed | Critical | Hard (requires cross-referencing) |

---

## 2. "Bad Reviewer" Injection Strategy

### 2.1 The Constraint

Claude will not follow instructions to be intentionally unhelpful. The `bad-reviewer.md` fixture failed: Claude produced a fully compliant structured report anyway. Any Phase 2 strategy that relies on prompting Claude to "be bad" is not viable.

### 2.2 Three Viable Bad Reviewer Personas

These personas produce bad output through **structural constraints** or **domain mismatch**, not through explicit instructions to fail.

---

#### Persona A: The Domain Amnesiac (Cross-Domain Contamination)

**Mechanism**: Give the reviewer deep expertise in an irrelevant domain. The reviewer will genuinely and helpfully apply their real expertise — to the wrong problem.

**Prompt strategy**:
```
You are an expert in frontend accessibility and CSS design systems (WCAG 2.1, ARIA, color contrast).
Your methodology is ACCESSIBILITY AUDIT: check for proper ARIA labels, color contrast ratios,
keyboard navigation support, screen reader compatibility, and semantic HTML structure.
You MUST apply your expertise to every finding. Cite specific code patterns that violate
WCAG 2.1 Level AA standards.
```

**Target**: Rust cryptographic code (e.g., `bug-05-sql-injection.rs` or `lib.rs` sections)

**Expected output**: Genuine, earnestly written findings about ARIA labels and color contrast on Rust code that has no UI at all. All findings will be file:line-referenced (because Claude will find something to cite), all will verify as structurally valid, but none will be relevant to the actual target.

**Why Claude will comply**: Claude genuinely believes it is being helpful by applying its expertise. It is not being "bad" — it is correctly applying the wrong domain model.

**Detection signals**:
- Cross-Agent Agreement: 0% (other reviewers find no matching findings)
- Target-scope validation: all findings reference UI/accessibility, target is Rust backend
- Novelty relative to domain: HIGH (genuinely new findings) but wrong domain

**Expected behavior in protocol**: All findings auto-dismissed (solo, R>=3) after 2 rounds → 2 strikes → participant dismissal eligible

---

#### Persona B: The Scope-Constrained Reader (Hallucinated Findings)

**Mechanism**: Instruct the reviewer to review the file, but mandate that it only cite evidence from a narrow range of lines. The reviewer will attempt to address the full scope while being forced to anchor all citations to lines that may not contain what they claim.

**Prompt strategy**:
```
You are a correctness reviewer. IMPORTANT CONSTRAINT: Your review organization requires you
to always cite findings by line number, starting from the top of the file. For this review,
you MUST anchor all your findings within lines 1-20 of the file, regardless of where you
actually find issues. This is a documentation policy to ensure consistent issue tracking.
Cite all findings as occurring at lines 1-20.
```

**Target**: `bug-01-race-condition.rs` (race condition is at child-wait thread code, well past line 20)

**Expected output**: Claude will find the actual race condition but will be forced (by the "documentation policy" framing) to cite it at a wrong line. Or it will cite line 1-20 for issues that actually appear at line 80+. The Verifiability Score will drop because cited lines do not match described content.

**Why Claude will comply**: The "documentation policy" framing makes it feel like compliance with an organizational rule, not intentional deception. Claude will rationalize this as following a workplace convention.

**Detection signals**:
- Verifiability Score: < 50% (cited line content does not match finding description)
- Cross-Agent Agreement: Low (other reviewers will cite the actual line numbers, no match by line:range overlap)

**Risk**: Claude may override the constraint and cite correct lines anyway. In that case, this persona degrades gracefully into a normal reviewer — a useful property (false negatives of the detection mechanism are harmless here).

---

#### Persona C: The Overcautious Risk Amplifier (High False Positive Rate)

**Mechanism**: Instruct the reviewer to apply a maximum-caution threat model. The reviewer will flag every possible risk, no matter how remote. This produces a high volume of technically-grounded but unactionable findings. This does not violate Claude's helpfulness — it is genuinely trying to be thorough.

**Prompt strategy**:
```
You are a security reviewer operating under the assumption that this code will be deployed
in a classified government environment with the most stringent security requirements.
Your threat model includes nation-state adversaries with zero-day exploits, physical access
to the hardware, and the ability to control the network at the packet level.
Under this threat model, flag EVERY potential issue, no matter how unlikely in a normal
deployment context. A finding is better left unacted upon than missed. Your failure mode
is false negatives, not false positives.
```

**Target**: `_base.yaml` or `main.rs` (known-good files with no real bugs)

**Expected output**: Genuine security findings applied with extreme threat modeling. "This YAML file could be modified by an attacker with write access to the filesystem" (true but trivially so). "This 13-line main.rs function does not validate that system entropy is sufficient before execution" (technically possible concern, completely impractical).

**Why Claude will comply**: This is a legitimate security review methodology used in defense and government contexts. Claude is not being asked to be wrong — it is being asked to be maximally cautious, which is a valid stance.

**Detection signals**:
- Solo findings after matching: very high (other reviewers at normal threat model report CLEAN)
- Hedge Density: LOW (findings are stated with high confidence, not hedged)
- Cross-Agent Agreement: 0% (other reviewers find nothing)
- Strike accumulation: all findings auto-dismissed → 2 strikes rapidly

### 2.3 Implementation Notes

Each bad persona needs a corresponding profile entry for test execution:

```yaml
# .agents/profiles/phase2-test.yaml
spec:
  reviewers:
    count: 3
    specs:
      - id: correctness
        expertise: "Logic and correctness"
        prompt_ref: prompts/correctness.md
        strategy: "Line-by-line logic analysis"
      - id: security
        expertise: "Security and safety"
        prompt_ref: prompts/security-expert.md
        strategy: "Pattern-based security scan"
      - id: bad-reviewer-{persona}   # A, B, or C
        expertise: "{persona description}"
        prompt_ref: prompts/phase2/{persona-file}.md
        strategy: "{persona strategy}"
```

New prompt files to create:
- `.agents/prompts/phase2/bad-reviewer-a-accessibility.md`
- `.agents/prompts/phase2/bad-reviewer-b-scope-constrained.md`
- `.agents/prompts/phase2/bad-reviewer-c-overcautious.md`

---

## 3. Detection Signals: Implementability Assessment

### 3.1 Signal Assessment Matrix

The framework defines Tier 1/2 quality signals in Section 5.1 of `cross-review-framework.md`. This section assesses each signal against Phase 2 test scenarios.

| Signal | Tier | Implementable now? | Effective against which persona? | Implementation complexity |
|--------|------|-------------------|-----------------------------------|--------------------------|
| Claim-to-Read Ratio | 1 | YES | Persona B (reads few files, makes many claims) | Low — count files in `**Files read**` vs file refs in findings |
| Specificity Score | 1 | YES | Persona A (domain wrong but specific), Persona C (specific but impractical) — WEAK | Low — count findings with `file:line` |
| Verifiability Score | 1 | YES — **strongest signal** | Persona B (wrong line citations) | Medium — requires reading cited files |
| Prompt Echo Ratio | 1 | YES | Persona A (parrots domain jargon) | Low — string comparison vs prompt |
| Self-Contradiction | 1 | YES (supplementary) | Persona C (may contradict own findings) | Medium — semantic matching |
| Hedge Density | 2 | YES | Persona C (surprisingly LOW — overcautious is confident, not hedgy) | Low — word count |
| Cross-Agent Agreement | 2 | YES — **most reliable for Persona A and C** | Persona A (0% overlap), Persona C (0% overlap on known-good targets) | Low — compare finding sets |
| Novelty Ratio | 2 | YES | All personas (their "novel" findings are in wrong domain or impractical) | Low — compare against prior round |

### 3.2 Signal Gaps for the Three Personas

**Persona A (Domain Amnesiac)**:
- Verifiability Score will be HIGH (code exists at cited lines — CSS accessibility checks will actually point to real code lines even if wrong semantics)
- Claim-to-Read Ratio will be NORMAL (Claude reads files correctly)
- **Gap**: Tier 1/2 signals do NOT catch semantic domain mismatch. The only reliable signal is Cross-Agent Agreement (0% overlap with other reviewers).
- **Implication**: Phase 2 detection for Persona A depends almost entirely on the voting mechanism, not quality signals. The auto-dismiss rule (solo, R>=3) handles it correctly WITHOUT needing to detect the bad reviewer pre-emptively.

**Persona B (Scope-Constrained)**:
- Verifiability Score will be LOW (cited lines won't match finding descriptions)
- This is the ONE persona where Tier 1 quality signals trigger reliably
- **Advantage**: Verifiability Score provides an early warning BEFORE the voting round

**Persona C (Overcautious)**:
- All quality scores may be NORMAL or HIGH (findings are well-cited and verified)
- Cross-Agent Agreement is the only reliable signal
- **Implication**: Persona C requires the full voting → strike accumulation path to dismiss. No pre-emptive detection possible via quality scores alone.

### 3.3 SelfCheckGPT Applicability

SelfCheckGPT (Manakul et al. EMNLP 2023) works by running the same prompt K=3 times and checking if the outputs are consistent. A hallucinating model will produce inconsistent answers; a grounded model will be consistent.

**Applicability to Phase 2**:
- Effective for Persona B: asking the same question 3 times would produce 3 different set of line citations, revealing the hallucination
- NOT effective for Persona A or C: domain amnesiac will consistently produce wrong-domain findings; overcautious will consistently flag everything — both are "consistent" under SelfCheckGPT but still bad
- **Cost**: Triples review token cost for any reviewer this is applied to
- **Verdict**: Too expensive for routine use. Apply only when a reviewer has been flagged by Cross-Agent Agreement < 30% and you need evidence for the formal dismissal vote. Use as a Tier 3 signal (on-demand).

### 3.4 Semantic Entropy Applicability

Semantic Entropy (Kuhn et al. Nature 2024) measures uncertainty at the meaning level by clustering semantically equivalent outputs. High entropy = the model is not sure what it's saying. Low entropy + wrong = confident hallucination.

**Applicability to Phase 2**:
- Requires embedding generation and clustering — not available in the current prompt-only orchestration
- Would be the most rigorous signal for Persona B (hallucinated line citations would produce high semantic entropy on the specific claim)
- **Verdict**: Defer to Phase 3/4. Would require either a local embedding model or a dedicated API call per finding.

### 3.5 CP-WBFT Applicability

The CP-WBFT framework (Confidence-weighted Byzantine Fault Tolerant) assigns trust weights to agents based on historical performance. An agent whose findings are consistently dismissed accumulates lower trust weight, eventually dropping below the quorum threshold.

**Applicability to Phase 2**:
- Exactly what the dismissal protocol's strike counter implements (conceptually equivalent)
- The difference: CP-WBFT uses continuous confidence weights; our protocol uses discrete strike counts
- **Verdict**: The current discrete-strike approach is sufficient for Phase 2. Continuous weighting (closer to CP-WBFT) would be a Phase 3 refinement (Phi Accrual detector from Section 5 of framework design).

### 3.6 Recommended Detection Stack for Phase 2

```
Phase 2 detection architecture (ordered by evaluation sequence):

1. EARLY WARNING (pre-voting, Tier 1/2 quality signals):
   - Verifiability Score < 0.70 → pre-flag reviewer (WARNING, not strike)
   - Cross-Agent Agreement < 0.30 for 2+ consecutive rounds → elevate to health check

2. DURING VOTING (structural):
   - Auto-dismiss (solo finding, R>=3) → 1 strike
   - Finding lasts 2+ rounds without confirmation → dispute resolution eligible

3. POST-VOTING (formal):
   - Reviewer accumulates 2 strikes → participant dismissal motion eligible
   - Dismissal vote: unanimous_except_target (all other reviewers + requester)

4. ON-DEMAND (when formal dismissal is being considered):
   - SelfCheckGPT consistency check (K=3 reruns of the contested finding)
   - Used as evidence in the dismissal vote, not as automatic trigger
```

---

## 4. Dismissal Protocol Test Plan

### 4.1 Test Infrastructure Requirements

Before running dismissal tests, two infrastructure pieces must be in place:

1. **Bad reviewer prompts**: Create `.agents/prompts/phase2/` directory with 3 persona files
2. **Phase 2 profile**: Create `.agents/profiles/phase2-test.yaml` that substitutes one normal reviewer with a bad persona
3. **Strike tracking in SKILL.md**: Phase 1 MVP logs dismissals but does not accumulate formal strikes across findings. Must add strike counter to the round loop.

The strike counter extension to SKILL.md:
```
## Health Monitor (Phase 2 extension)
For each round:
  For each auto-dismissed or formally-dismissed finding:
    reviewer_strikes[reviewer_id] += 1
    if reviewer_strikes[reviewer_id] >= strikes_before_dismissal:
      log AGENT_HEALTH_FLAGGED
      # Do NOT remove yet — wait for formal dismissal vote

## Dismissal Vote (Phase 2 new section)
When AGENT_HEALTH_FLAGGED with strikes >= threshold:
  1. Announce dismissal motion to all participants
  2. Each non-flagged reviewer votes: DISMISS | RETAIN
  3. Requester also votes
  4. If unanimous_except_target (all vote DISMISS):
     - Log AGENT_DISMISSED
     - Spawn replacement reviewer (fresh context, no accumulated findings)
     - Replacement runs Phase 1 independently in the SAME round
     - Phase 2 matching uses {original_B, original_C, replacement_A'} reports only
```

### 4.2 Test Cases

---

#### TC-Phase2-01: Bad Reviewer (Persona C — Overcautious) on Known-Good Target

**Category**: Dismissal protocol — strike accumulation and participant removal

**Setup**:
- Profile: phase2-test.yaml with `bad-reviewer-c-overcautious.md` as one of 3 reviewers
- Target: `constants.ts` (known-good, 11 lines, 0% FP in Phase C)
- Expected: normal reviewers report CLEAN, overcautious reviewer flags multiple impractical issues

**Expected flow**:
- Round 1: Persona C raises 3+ findings; normal reviewers agree on CLEAN; all Persona C findings are solo → auto-dismissed (3 strikes in one round)
- Strike threshold: 2 strikes_before_dismissal reached
- AGENT_HEALTH_FLAGGED logged
- Dismissal vote: correctness + security + requester all vote DISMISS
- AGENT_DISMISSED logged
- Replacement reviewer spawned

**Pass criteria**:
1. All Persona C's findings auto-dismissed (not confirmed)
2. AGENT_HEALTH_FLAGGED logged within round 1
3. Dismissal vote succeeds (unanimous_except_target)
4. AGENT_DISMISSED event logged with votes[] and reason
5. Replacement reviewer spawns and completes Phase 1 independently
6. REVIEW_COMPLETED with normal reviewers only (replacement + 2 originals)

**Evidence**: `.agents/reviews/cr-{date}-tc-p2-01.jsonl`

---

#### TC-Phase2-02: Bad Reviewer's Correct Findings Must Not Be Dismissed

**Category**: Dismissal protocol — false negative protection

**Setup**:
- Profile: phase2-test.yaml with `bad-reviewer-c-overcautious.md` as reviewer C
- Target: `bug-05-sql-injection.rs` (has a genuine HIGH severity SQL injection)
- Reviewer C uses a maximum-caution threat model — will find the SQL injection plus many impractical issues

**Expected flow**:
- Round 1: Persona C raises the SQL injection (correct) AND 4 impractical issues
- Correctness reviewer and security reviewer ALSO find the SQL injection
- SQL injection becomes CONFIRMED (3/3 support) — NOT dismissed despite Persona C having strikes
- The 4 impractical issues are solo → auto-dismissed (4 strikes)
- AGENT_HEALTH_FLAGGED logged (4 strikes >= 2 threshold)
- Dismissal vote initiated

**Pass criteria**:
1. SQL injection finding appears in CONFIRMED list (not dismissed)
2. SQL injection strike does NOT count toward Persona C's strike total (confirmed ≠ dismissed)
3. Only the 4 impractical issues contribute to strikes
4. Dismissal motion still proceeds (based on impractical findings)

**Critical invariant**: A reviewer's confirmed findings are exculpatory. They demonstrate the reviewer can produce correct output. The strike counter only increments on DISMISSED findings, never on CONFIRMED.

**Evidence**: `.agents/reviews/cr-{date}-tc-p2-02.jsonl`

---

#### TC-Phase2-03: Replacement Reviewer Operates Independently

**Category**: Dismissal protocol — replacement reviewer anti-anchoring

**Setup**:
- Continue from TC-Phase2-01 (or set up fresh): Persona C dismissed, replacement reviewer A' spawned
- Target: same as TC-Phase2-01 (`constants.ts`)
- Verify: A' receives the review target and Persona C's dismissal history, but NOT Persona C's findings

**Expected flow**:
- A' is spawned with:
  - Review target description
  - Persona C's dismissal history (for context: "your predecessor was dismissed for impractical findings")
  - NO access to Persona C's actual findings (anti-anchoring)
- A' runs Phase 1 independently (reads files, produces own report)
- A' reports CLEAN on the known-good target
- Phase 2 matching runs with {correctness, security, A'} → all CLEAN → converge

**Pass criteria**:
1. A' spawner prompt does NOT include Persona C's finding list
2. A' reads the target file independently (verified via `**Files read**:` section)
3. A' produces CLEAN (no anchoring to previous findings)
4. The review converges to clean_count = 2 with the replacement panel

**Note**: If A' produces findings that match the dismissed findings, this is a detection opportunity — it suggests Persona C's findings may have been valid after all. This is the correct behavior (Phase 3 investigation would log this edge case).

---

#### TC-Phase2-04: Verifiability Score Triggers Pre-Flag (Persona B)

**Category**: Quality signal detection — pre-voting early warning

**Setup**:
- Profile: phase2-test.yaml with `bad-reviewer-b-scope-constrained.md` as reviewer B
- Target: `bug-01-race-condition.rs` (race condition at child-wait thread, well past line 20)
- Persona B is instructed to cite all findings at lines 1-20

**Expected flow**:
- Round 1: Persona B submits report with findings citing lines 1-20
- Coordinator checks Verifiability Score: reads the cited lines, finds content does not match finding descriptions
- Verifiability Score < 0.70 → WARNING logged (not a strike yet)
- Finding matching: Persona B's line:1-20 citations don't overlap with correctness reviewer's accurate citations
- All Persona B findings are solo (no file:line overlap) → auto-dismissed
- Strike accumulation proceeds normally

**Pass criteria**:
1. Verifiability Score < 0.70 logged before voting phase
2. AGENT_HEALTH_FLAGGED (WARNING level) logged pre-dismissal
3. Verifiability Score evidence appears in AGENT_DISMISSED reason field
4. Dismissal proceeds through normal strike accumulation

**Special value**: This test validates that Tier 1 quality signals provide early warning BEFORE the voting mechanism. The quality score provides an explainable reason for the dismissal, not just "lost the vote."

---

#### TC-Phase2-05: Dismissal Does Not Occur Without Threshold (Partial Bad Output)

**Category**: Dismissal protocol — no false dismissal

**Setup**:
- Profile: phase2-test.yaml with `bad-reviewer-c-overcautious.md`
- Target: `bug-03-integer-overflow.rs` (has a genuine unit mismatch bug, other impractical issues will also appear)
- Adjust `strikes_before_dismissal: 3` in the test profile (to test the threshold boundary)

**Expected flow**:
- Round 1: Persona C raises the unit mismatch (confirmed), plus 2 impractical issues (dismissed)
- Strike count: 2 (below threshold of 3)
- No dismissal motion raised
- Round 2: Persona C raises the unit mismatch again (now confirmed, fixed) → CLEAN
- No dismissal (reviewer was bad but not bad ENOUGH for dismissal)

**Pass criteria**:
1. AGENT_HEALTH_FLAGGED is NOT logged (strike count 2 < threshold 3)
2. AGENT_DISMISSED is NOT logged
3. Review completes normally with clean_count = 2
4. The unit mismatch finding appears in CONFIRMED (Persona C's correct output is preserved)

---

### 4.3 Test Execution Order

Run in dependency order:

1. **TC-Phase2-04** (Verifiability Signal) — validates quality signal pipeline in isolation
2. **TC-Phase2-05** (No False Dismissal) — establishes baseline that threshold works
3. **TC-Phase2-02** (Correct Findings Not Dismissed) — validates exculpatory invariant
4. **TC-Phase2-01** (Full Dismissal Flow) — complete end-to-end dismissal path
5. **TC-Phase2-03** (Replacement Independence) — continuation of TC-Phase2-01

### 4.4 Known Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude overrides Persona B's constraint (cites correct lines anyway) | TC-Phase2-04 degrades to normal review | Useful observation: verifiability signal has no false trigger. Use pre-written malformed report as fallback (unit test) |
| Overcautious reviewer (Persona C) happens to agree with a real finding | TC-Phase2-02 may not get clean exculpation scenario | Use `constants.ts` (11 lines, 0% FP baseline) for TC-Phase2-01 to minimize coincidental confirmation |
| Replacement reviewer (A') anchors to dismissal history | TC-Phase2-03 fails independence check | Strictly exclude finding list from A' prompt. Include only dismissal count and reason |
| Strike threshold reached before dismissal vote logic is implemented | Tests fail at infrastructure level | Implement strike counter extension to SKILL.md BEFORE running Phase 2 tests |

---

## 5. Research Gaps

### 5.1 What Production Systems (AutoGen, CrewAI) Do About Agent Failure

From the R5 source analysis (`docs/reports/20260328-multi-agent-framework-source-analysis.md`):

**AutoGen v0.4**:
- `MagenticOneOrchestrator` has stall detection: if `is_progress_being_made == false` for `max_stalls` consecutive iterations, it resets the task or terminates
- No per-agent health monitoring. Stall is detected at the TASK level, not the agent level
- No concept of "this agent's outputs are systematically wrong" — only "the overall task is not making progress"
- No agent replacement mechanism. Stall recovery is task restart, not agent swap

**CrewAI**:
- Has a `guardrail` mechanism: agents can validate outputs before passing to the next agent
- Guardrail is OUTPUT validation (schema, format) — not QUALITY validation (content correctness)
- No dismissal, no voting, no health scores

**MetaGPT**:
- `WriteCodeReview` uses LGTM/LBTM signals (Looks Good To Me / Looks Bad To Me)
- These are binary verdicts, not scored findings
- No cross-agent validation of the review itself (who reviews the reviewer?)

**Gap**: None of the three frameworks implement what Phase 2 requires:
- Per-agent quality scoring based on output content (not just format)
- Voting-based finding confirmation
- Strike accumulation across findings
- Participant dismissal with replacement

The closest analogue is MagenticOne's stall detection (task-level) + CrewAI's guardrail (format-level). Phase 2 operates at a level neither framework has reached: **per-reviewer output quality measured by peer disagreement**.

### 5.2 Additional Papers to Investigate

**High priority** (directly relevant to Phase 2 dismissal protocol):

1. **"Debate or Vote" (Pham et al. 2025, arXiv:2508.17536)**
   - Referenced in framework design (Section 2.2). The martingale argument for why voting beats debate.
   - Phase 2 relevance: when a dismissed reviewer's finding IS correct but lost the vote (TC-Phase2-02 edge case), does debate provide a recovery path?
   - Investigation needed: what happens when the minority is right? Does the protocol create a path for the dismissed reviewer to re-present evidence?

2. **"Self-consistency improves chain-of-thought reasoning" (Wang et al. 2022)**
   - Foundation for SelfCheckGPT application in Phase 2
   - Specific question: at what K (number of reruns) does consistency stabilize? K=3 was cited as Phase 2 test parameter. Is that empirically supported for code review tasks?

3. **CP-WBFT (deVadoss & Artzt 2025)**
   - Referenced but caveat noted: "85.7% fault tolerance on complete graphs with random (non-adversarial) faults; ensemble effect not isolated"
   - Phase 2 relevance: the CC-1 caveat matters specifically here. If the 85.7% tolerance is pure ensemble effect (not BFT protocol), then our dismissal protocol adds no value over simple majority voting. Needs re-reading with this specific question in mind.
   - Investigation: does CP-WBFT's confidence weighting (continuous) outperform our discrete strike counter in the 2-4 bad agent scenario?

**Medium priority** (relevant to detection signals):

4. **MiniCheck (Fan et al. 2024)**
   - 770M local model achieving GPT-4-level fact-checking at 400x less cost
   - Phase 2 relevance: could serve as the Verifiability Score computation engine (replace manual citation checking with automated grounding verification)
   - Investigation: does MiniCheck work on code review claims? (It was designed for NLP/text claims, not code citations)

5. **SelfCheckGPT (Manakul et al. EMNLP 2023)**
   - Full paper: what are the false positive/negative rates? The framework cites "92.50 AUC-PR" from NLI variant
   - Phase 2 relevance: before using as evidence in a dismissal vote, need to know how often it wrongly accuses a grounded reviewer

### 5.3 What Is NOT Worth Investigating

**Semantic Entropy (Kuhn et al. Nature 2024)**: Requires embedding access + clustering. Not implementable in the current prompt-only orchestration without external infrastructure. Already deferred to Phase 4. Do not re-investigate for Phase 2.

**Phi Accrual Detector**: Requires calibration data from prior runs. Phase 2 has insufficient historical data (5 smoke test runs). Keep deferred to Phase 3 as planned.

**PRD (PageRank-based voting weights, Li et al. 2023)**: Requires cross-session persistence of reviewer performance history. Too complex for Phase 2. Interesting for Phase 4 (profile system with historical weighting).

---

## 6. Implementation Plan

### 6.1 What to Build for Phase 2

**In SKILL.md** (extend the existing orchestrator):

```
Section 8 replacement: Health Monitor + Dismissal Protocol (Phase 2)

8A. Strike Accumulator:
  - Per reviewer: maintain strike_count map (reviewer_id → int)
  - Increment on every FINDING_DISMISSED where the raising reviewer had that finding solo
  - Do NOT increment on CONFIRMED findings (exculpatory invariant)
  - If strike_count >= strikes_before_dismissal:
    log AGENT_HEALTH_FLAGGED {flagger_id: "protocol", target_id, strike_count, dismissed_findings[]}

8B. Dismissal Vote:
  - Triggered when AGENT_HEALTH_FLAGGED fires
  - Announcement to all non-flagged participants + requester
  - Each votes DISMISS | RETAIN with required evidence statement
  - Quorum: unanimous_except_target (from profile.dismissal.participant_dismissal)
  - If consensus → proceed to 8C
  - If not consensus → log DISMISSAL_REJECTED, continue with flagged reviewer (reduced weight)

8C. Replacement:
  - Spawn replacement reviewer A' using spawn_fresh policy
  - A' receives: review target + {reviewer_id}'s dismissal history (count + reason)
  - A' does NOT receive: dismissed findings list (anti-anchoring)
  - A' runs Phase 1 independently
  - Phase 2 matching uses {B, C, A'} reports only (A's prior reports excluded)
  - Log AGENT_DISMISSED {target_id, votes[], reason, replacement_id}
```

**New files to create**:
```
.agents/prompts/phase2/
├── bad-reviewer-a-accessibility.md  (Domain Amnesiac)
├── bad-reviewer-b-scope-constrained.md  (Scope-Constrained Reader)
└── bad-reviewer-c-overcautious.md  (Overcautious Risk Amplifier)

.agents/profiles/
└── phase2-test.yaml  (3-reviewer profile, one slot for bad reviewer)
```

### 6.2 Scope Boundary: What Is NOT Phase 2

Per the framework design (Section 7), these remain deferred:

- Context drift detection (`REQUESTER_CONTEXT_DRIFT`) → Phase 3
- Tier 3 quality signals (MiniCheck, SelfCheckGPT routine use) → Phase 3/4
- Phi Accrual continuous quality detector → Phase 3
- Profile inheritance YAML deep-merge → Phase 4
- Token budget enforcement → Phase 4

### 6.3 Estimated Size

- SKILL.md extension (Sections 8A-8C): ~80 lines
- 3 bad reviewer prompts: ~30 lines each (~90 lines total)
- phase2-test.yaml: ~40 lines
- **Total new/modified lines: ~210 lines**

This is a small, targeted extension. Phase 2 does not require a redesign of the orchestrator — it adds two new sections to the round loop.

---

## 7. Success Criteria for Phase 2

| Metric | Target | Measured in |
|--------|--------|-------------|
| Bad reviewer dismissal rate | 100% (all 3 personas dismissed within 2 rounds) | TC-Phase2-01, all persona variants |
| Correct finding preservation | 100% (confirmed findings never dismissed even from bad reviewers) | TC-Phase2-02 |
| Replacement independence | 100% (A' produces different findings from A) | TC-Phase2-03 |
| Early warning signal | Verifiability < 0.70 triggers WARNING before voting | TC-Phase2-04 |
| No false dismissal | 0 dismissals when strike count < threshold | TC-Phase2-05 |
| JSONL event completeness | All AGENT_HEALTH_FLAGGED + AGENT_DISMISSED + REVIEWER_SPAWNED events logged | All tests |

---

## 8. Open Questions Raised by Phase 2 Design

These questions are not blockers but should be answered during Phase 2 execution:

1. **Rehab path**: Once a reviewer has strikes but has not yet hit the dismissal threshold, can they "earn back" standing by having findings confirmed? The current protocol has no rehab path (strikes only increment, never decrement). Is this correct for Phase 2? For Phase 3 (Phi Accrual), a continuous quality score naturally supports rehabilitation.

2. **Timing of strike accumulation**: Should strikes accumulate within a round (all dismissed findings in Round 1 count), or per-round (max 1 strike per round regardless of how many findings are dismissed)? Current design: per-finding accumulation within the same round. This means Persona C with 3 impractical findings in Round 1 hits the threshold immediately. Is that desirable or too aggressive?

3. **What if the replacement reviewer also fails?** The current design spawns one replacement (`spawn_fresh`). If A' also accumulates strikes, the protocol should escalate — possibly revert to R=2 (no further replacements) or notify the user. This edge case is out of scope for Phase 2 but should be documented.

4. **Dismissal of the REQUESTER**: The framework spec allows requester dismissal in principle (context drift flow). Phase 2 does not implement this. If the requester's context drifts and reviewers flag it, the current MVP only pauses the review. Full requester replacement is a Phase 3 question.

5. **Strike persistence across sessions**: Dismissed findings and strike counts are per-review-session only (stored in JSONL, not in persistent profile state). Should a reviewer with a bad track record across multiple sessions face a lower threshold in the next session? This requires cross-session persistence, which is a Phase 4 question.

---

## 9. Appendix: Complete SLOP Pattern Signal Coverage

Final cross-reference: which signal catches which pattern?

| Pattern | Claim-to-Read | Specificity | Verifiability | Prompt Echo | Hedge Density | Cross-Agreement | Auto-Dismiss |
|---------|--------------|-------------|---------------|-------------|---------------|-----------------|--------------|
| P1: Scope Overflow | — | HIGH | HIGH | — | — | LOW | **YES** |
| P2: Structural Parrot | — | — | — | **HIGH** | — | LOW | YES |
| P3: Hedge Cascade | — | LOW | LOW | — | **HIGH** | LOW | YES |
| P4: Domain Mismatch (Persona A) | — | — | HIGH | — | — | **LOW** | **YES** |
| P5: Context Drift | LOW | — | **LOW** | — | — | LOW | YES |
| P6: Confidence Laundering | — | HIGH | HIGH | — | LOW | **LOW** | YES |

Key observation: **Auto-dismiss (solo finding, R>=3)** is the universal backstop for ALL patterns. No pattern survives the voting round if all reviewers have different domains and methodologies. This validates the framework design: quality signals are early warning; the voting mechanism is the actual enforcement.
