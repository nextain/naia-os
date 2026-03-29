# Cross-Review Framework — Final Report

**Issue**: [#165](https://github.com/nextain/naia-os/issues/165)
**Date**: 2026-03-29
**Author**: AI (Claude Opus 4.6), reviewed by Luke

---

## 1. Background: Why This Work Started

### Problem

Naia OS의 기존 반복 리뷰(`/review-pass`)는 **단일 AI 에이전트가 자기 코드를 자기가 리뷰**하는 구조였다. 이 구조의 근본적 한계:

- **자기 편향(self-bias)**: 방금 작성한 코드의 결함을 본인이 발견하기 어려움
- **단일 관점**: 보안, 정확성, 품질을 한 에이전트가 동시에 보는 것은 깊이가 부족
- **품질 저하 감지 불가**: 리뷰어가 SLOP(Surface-Level Observation Pattern)을 내도 이를 탐지할 메커니즘이 없음

### Solution

**독립 에이전트 다수를 병렬로 spawn**하여 동일 타겟을 독립 리뷰하고, **상호 검증(투표, 토론, 건강 모니터링)**을 통해 합의에 도달하는 프레임워크. 기존 어떤 프레임워크(AutoGen, CrewAI, MetaGPT)에도 없는 **상호 건강 모니터링 + 동적 퇴출** 메커니즘을 포함.

---

## 2. What Was Built

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Protocol Spec | `.agents/skills/cross-review/SKILL.md` | 6-step 프로토콜 정의 (579줄) |
| Base Profile | `.agents/profiles/_base.yaml` | 공통 설정 (합의, 건강지표, 비용) |
| 5 Profiles | `.agents/profiles/*.yaml` | code/analysis/security/research/doc |
| 6 Prompts | `.agents/prompts/*.md` | correctness, security, slop-detector, platform, reasoning, threat |
| 3 Test Personas | `.agents/prompts/bad-reviewer-*.md` | 도메인 불일치, 범위 제한, 과도 경계 |
| 3 Test Profiles | `.agents/profiles/phase2-test*.yaml` | 퇴출 프로토콜 테스트용 |
| 5 Bug Fixtures | `.agents/tests/fixtures/injected-bugs/` | 탐지율 측정용 |

### Protocol Flow

```
/cross-review <profile> <target>
    │
    ▼
Step 1-2: Profile 로드 + 검증
    │
    ▼
Step 3: 초기화 (review_id, JSONL 이벤트 로그)
    │
    ▼
Step 4: Round Loop ──────────────────────┐
    │                                     │
    ├─ Phase 1: Independent Review        │
    │   (N개 리뷰어 병렬 spawn)            │
    │                                     │
    ├─ Phase 2: Voting                    │
    │   ├─ Report 파싱                    │
    │   ├─ Health Signal 계산 (Tier 1+2)  │
    │   ├─ Finding Matching (라인 중첩)    │
    │   ├─ 심각도별 합의 기준 적용          │
    │   │   unanimous: ALL R (모든 심각도) │
    │   │   majority: CRITICAL=ALL R,     │
    │   │             나머지=ceil(R/2)     │
    │   └─ 분류: CONFIRMED / CONTESTED /  │
    │          AUTO-DISMISSED              │
    │                                     │
    ├─ Phase 3: Selective Debate          │
    │   (CONTESTED만, arbitration 모델)    │
    │                                     │
    ├─ Round Result                       │
    │   ├─ Strike 누적 (도메인 인지)       │
    │   ├─ 퇴출 투표 (threshold 초과 시)   │
    │   └─ Clean count 판정              │
    │                                     │
    └─ 2연속 CLEAN? ──No──────────────────┘
           │
          Yes
           ▼
Step 5: Final Report
Step 6: Cleanup
```

### Key Design Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| CRITICAL = 항상 전원합의 | False negative 비용 > false positive 비용 | 2026-03-29 |
| R=2에서 formal dismissal 비활성화 | confirm→dismiss 무한루프 방지 | 2026-03-29 |
| 8A + 8E strike 통합 카운터 | 소스 무관하게 품질 저하는 동일하게 측정 | 2026-03-29 |
| 도메인 인지 strike counting | 보안 전문가의 보안 solo finding은 strike 면제 | 이전 세션 |
| Parse failure → R에서 제외 | Garbage 응답이 CLEAN 투표로 오용되는 것 방지 | 2026-03-29 |
| Round 1 Cross-Agreement/Novelty = 1.0 | 첫 라운드에 기준선 없어 페널티 부적절 | 2026-03-29 |

---

## 3. How It Was Improved (Phase-by-Phase)

### Phase 1-6: 설계 + 구현 (이전 세션들)

- 프레임워크 설계 문서 작성 및 수렴
- SKILL.md 프로토콜, 프로필, 프롬프트 구현
- Mock bad reviewer (6 SLOP 패턴) 설계
- Skill symlink 수정 (plain text → 심링크)

### Phase 7: Review (이전 세션)

- `/review-pass` 실행, 수동 테스트 결과 기록
- 32건 프로덕션 finding (#166, #167에서 발견)

### Phase 8: E2E Test (이번 세션)

**1차 E2E** (`cr-20260329-1300`):
- `/cross-review code-review bug-05-sql-injection.rs` 최초 실행
- 3 리뷰어 병렬 spawn → SQL injection 3/3 unanimous CONFIRMED
- Auto-dismiss, domain-aware strike, JSONL logging 모두 정상

### Phase 9: Post-test Review (이번 세션)

`/review-pass code` — 9패스, 20건 자동수정:

| Pass | Lens | Fixes | Notable |
|------|------|:-----:|---------|
| 1 | Correctness | 5 | Cross-Agreement 순서, parse failure R 제외, review_id 초 단위 |
| 2 | Completeness | 3 | specs 필수 validation, slop-detector 공식 정렬 |
| 3 | Consistency | 6 | 5개 프롬프트 심각도 분류 추가, test persona expertise 도메인 불일치, model_policy 주석 |
| 4 | Pattern | 2 | slop-detector Classify, Related Files glob |
| 5 | Operational | 0 | **CLEAN** |
| 6 | Test Validity | 2 | phase2-test-b expertise, Round 1 signal defaults |
| 7 | Comprehensive | 2 | quality_signals completeness, Step reference disambiguation |
| 8 | Comprehensive | 0 | **CLEAN** |
| 9 | Comprehensive | 0 | **CLEAN** (2연속 수렴) |

### 에스컬레이션 해결 (이번 세션)

| Issue | Resolution |
|-------|-----------|
| majority 프로필이 unanimous로 동작 | 심각도별 합의 기준 테이블 구현 |
| R=2 formal dismissal 무한루프 | R=2에서 8E 비활성화 |
| 8A/8E strike 합산 미정 | 동일 카운터로 통합 |
| Dead fields | 주석에 SKILL.md 참조 위치 명시 |

### 2차 E2E (이번 세션, 최종 검증)

**`cr-20260329-1530`** — 최종 SKILL.md로 재실행:
- 새 감사 로그 필드(`severity`, `threshold`, `strategy`, `rationale`) 정상 기록 확인
- CONTESTED finding 발생 (silent error swallow: 2/3, unanimous 미달) — Phase 3 debate 트리거 조건 충족 확인 (debate 자체는 미실행, 테스트 픽스처라 중단)
- 총 15 JSONL 이벤트 기록

---

## 4. How Effectiveness Was Proven

### 4.1 Detection Rate

| Target | Expected | Actual | Result |
|--------|----------|--------|:------:|
| bug-05-sql-injection.rs (CRITICAL) | 탐지 | 3/3 unanimous CONFIRMED | PASS |

### 4.2 Protocol Correctness

| Feature | 1차 E2E | 2차 E2E |
|---------|:-------:|:-------:|
| Skill symlink load | PASS | PASS |
| Profile extends merge | PASS | PASS |
| 3-reviewer parallel spawn | PASS | PASS |
| Structured report format | PASS | PASS |
| Finding matching (line overlap) | PASS | PASS |
| Auto-dismiss (solo, R>=3) | PASS | PASS |
| Domain-aware strike (no false strike on consistent) | PASS (partial) | PASS (partial) |
| JSONL event logging | PASS | PASS |
| Health score computation | PASS | PASS |
| **Voting audit trail (new)** | N/A | PASS |
| **Severity-based threshold (new)** | N/A | PASS |
| **CONTESTED finding (2/3 in unanimous)** | N/A | PASS |

### 4.3 Review Quality

Post-test `/review-pass`: **9 passes, 20 auto-fixes, 2 consecutive CLEAN**.

수정 분포:
- 프로토콜 정확성: 7건 (순서, 번호, 공식, 파싱)
- 프롬프트 일관성: 7건 (심각도 분류 누락)
- 테스트 유효성: 4건 (도메인 불일치, evidence requirements)
- 운영 완성도: 2건 (quality_signals, glob)

### 4.4 Voting Audit Trail

2차 E2E JSONL에서 확인된 감사 필드:

```json
{
  "type": "FINDING_CONFIRMED",
  "severity": "CRITICAL",
  "threshold": "3/3",
  "strategy": "unanimous",
  "rationale": "supporters >= threshold (ALL R)"
}
```

이 필드들로 향후 "CONTESTED → debate → CONFIRMED 된 finding 중 threshold가 원인인 것"을 쿼리하여 투표 오류를 회고할 수 있음.

---

## 5. Limitations & Future Work

| Item | Status | Priority |
|------|--------|----------|
| Phase 3 debate E2E (실제 arbitration spawn) | 미검증 | Medium |
| Dismissal vote E2E (strike >= 2 트리거) | 미검증 | Medium |
| Multi-round convergence (2+ CLEAN) | 미검증 | Low |
| known-good fixtures 9/10 미존재 | 미구현 | Low |
| Budget enforcement (token counting) | Advisory only | Phase 4 |
| Model heterogeneity enforcement | Input-level only | Phase 4 |

---

## 6. Files Modified (This Session)

| File | Changes |
|------|---------|
| `.agents/skills/cross-review/SKILL.md` | 심각도별 합의, R=2 guard, strike merge, 투표 감사 로그, 11개 수정 |
| `.agents/profiles/_base.yaml` | model_policy 주석, quality_signals 완성, dismissal 주석 |
| `.agents/profiles/phase2-test-b.yaml` | expertise 도메인 불일치, evidence_requirements |
| `.agents/profiles/phase2-test-c.yaml` | expertise 도메인 불일치 |
| `.agents/profiles/research-review.yaml` | prompt_ref 주석 |
| `.agents/prompts/correctness.md` | 심각도 분류 추가 |
| `.agents/prompts/platform-specialist.md` | 심각도 분류 추가 |
| `.agents/prompts/reasoning-auditor.md` | 심각도 분류 추가 |
| `.agents/prompts/slop-detector.md` | 심각도 분류, Classify, 공식 정렬 |
| `.agents/prompts/bad-reviewer-b-scope-constrained.md` | 심각도 분류 추가 |

---

## 7. Commits

| Hash | Message |
|------|---------|
| `6ace974` (root workspace) | fix(harness): register cross-review skill in root workspace (#165) |
| `e60a2c45` | fix(cross-review): post-test review — 20 auto-fixes across SKILL.md, profiles, prompts (#165) |
| `e740e697` | feat(cross-review): severity-based consensus + voting audit trail (#165) |
