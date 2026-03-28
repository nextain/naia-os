# Multi-Agent Mutual Verification Framework — Research Minutes

**Date**: 2026-03-28
**Issue**: #165
**Facilitator**: Main Agent (Coordinator)
**Participants**: Research Agents R1-R8, Cross-Check Agents CC-1/CC-2/CC-3

---

## 1. Background & Objective

naia-os의 반복 리뷰 과정에서 AI 자체 리뷰의 구조적 한계가 확인됨:
- 작성자=리뷰어 (같은 편향)
- 파일 안 읽고 "클린" 선언
- 컨텍스트 드리프트 후 환각
- 단일 리뷰어 = 단일 장애점

**목표**: 멀티에이전트 상호검증 프레임워크 설계를 위한 학술 리서치 및 실무 사례 조사.

---

## 2. Round 1 — 독립 리서치 (8명 병렬)

### 참여자 및 범위

| Agent | 전담 주제 | 소요 시간 | 도구 호출 수 |
|-------|----------|----------|------------|
| R1 | BFT + 합의 알고리즘 | ~5.7min | 23 |
| R2 | Multi-agent debate 메커니즘 | ~6.0min | 34 |
| R3 | Agent-as-Judge + 이상 감지 | ~4.6min | 16 |
| R4 | SLOP 탐지 + 품질 시그널 | ~4.9min | 32 |
| R5 | AutoGen/CrewAI/MetaGPT 코드 분석 | ~7.7min | 54 |
| R6 | 프로덕션 코드리뷰 AI 아키텍처 | ~3.6min | 20 |
| R7 | 분산 시스템 → AI 적용 | ~5.8min | 22 |
| R8 | 프레임워크 추상화 설계 | ~8.0min | 31 |

### R1: BFT + 합의 알고리즘 (주요 논문: CP-WBFT, ACL 2025)

**발표 요지**:
- CP-WBFT: 신뢰도 프로빙으로 85.7% 결함률에서도 완전 그래프 토폴로지 시 100% 복구
- ACL 2025: 7가지 의사결정 프로토콜 비교 — 투표는 추론 +13.2%, 합의는 지식 +2.8%
- 핵심: 에이전트 수 > 라운드 수, 독립 초안 먼저 (+7.4%), Approval Voting 실패 (27% 결정률)
- `3f+1` 공식: 1명 불신 → 최소 4명, 2명 → 7명

**주요 논문**: Du et al. ICML 2024, Kaesberg et al. ACL 2025, deVadoss & Artzt 2025, Li et al. 2025

### R2: Multi-agent Debate 메커니즘 (주요 논문: Du 2023, Smit ICML 2024)

**발표 요지**:
- **핵심 발견**: 토론 이득의 대부분은 앙상블 효과 (martingale 증명), 소통 자체가 아님
- 순수 다수결이 평균적으로 토론 능가 (산술: 99% vs 84%)
- 토론은 맞는 답을 뒤집을 수 있음 ("overly aggressive")
- DMAD: 페르소나 다양성 < 리뷰 전략(reasoning method) 다양성
- 크로스 심문: 환각 발견 87-98% 정확도
- **최적 구조**: 독립 리뷰 → 투표 → 불확실한 것만 토론

**주요 논문**: Du et al. 2023, Smit et al. ICML 2024, Cohen et al. EMNLP 2023, Liang et al. EMNLP 2024, "Debate or Vote" 2025

### R3: Agent-as-Judge (주요 논문: MAJ-EVAL, NeurIPS 2025)

**발표 요지**:
- MAJ-EVAL: 도메인 문서에서 자동 페르소나 구축, 토론 후 평가자 일치도 0.61→0.86
- NeurIPS 2025: 토론이 정확도 증폭 (수학 증명, 5가지 가정 하)
- 적응적 안정성 감지: KS < 0.05 × 2회 연속 → 토론 종료, 5-7라운드 수렴
- PRD PageRank식 가중치: 성과 기반 투표 가중치 — 외부 정답 없이 가능
- 단일 Judge 편향: +10%(GPT-4), +25%(Claude-v1) → 피어 투표가 나음

**주요 논문**: Chen et al. 2025 (MAJ-EVAL), NeurIPS 2025 (적응적 안정성), Li et al. 2023 (PRD), Zheng et al. 2023

### R4: SLOP 탐지 + 품질 시그널 (주요 논문: Shaib 2025, MiniCheck)

**발표 요지**:
- **LLM은 다른 LLM의 SLOP를 못 잡음** (kappa -0.01~0.03) — 패턴 기반이 우수
- 3티어 스코어링 설계:
  - Tier 1 (제로코스트): 파일/라인 존재, 함수명 확인 → 3개 이상 구조적 오류 시 거부
  - Tier 2 (10ms): 헤지 표현 밀도 >2/100단어, 문장 시작 반복 >60%
  - Tier 3 (저비용 로컬 모델): MiniCheck 770M (GPT-4급, 400배 저렴), SelfCheck-NLI (92.50 AUC-PR)
- Semantic Entropy Probes: API 기반에서는 비실용적

**주요 논문**: Shaib et al. 2025, MiniCheck 2024, Manakul et al. EMNLP 2023, Nature 2024

### R5: AutoGen/CrewAI/MetaGPT 코드 분석

**발표 요지**:
- **3대 프레임워크 모두 합의/투표 미구현** — 화자 선택만 있음
- 상호 헬스 모니터링, 동적 교체, 컨텍스트 드리프트 감지 전무
- 전부 중앙 오케스트레이션 모델 — 에이전트를 피어로 취급 안 함
- 채택할 패턴: MagenticOne progress ledger, CrewAI guardrail, MetaGPT LGTM/LBTM

**분석 대상**: AutoGen v0.4 (`BaseGroupChatManager`, `SelectorGroupChat`, `MagenticOneOrchestrator`), CrewAI (`Crew`, guardrail), MetaGPT (`Role`, `WriteCodeReview`)
**상세 보고서**: `docs/reports/20260328-multi-agent-framework-source-analysis.md` (695줄)

### R6: 프로덕션 코드리뷰 AI 아키텍처

**발표 요지**:
- **Judge Agent 패턴 거의 보편적** (HubSpot, Qodo, CodeRabbit, Cursor)
- CodeRabbit: grep/ast-grep 자체검증 스크립트 > LLM 재확인
- Cursor BugBot: 8-pass 병렬 + 다수결 → 에이전틱 전환 (2M PRs/월)
- "공격적으로 찾고 필터"가 "조심스럽게 찾기"보다 나음
- c-CRAB 벤치마크: 모든 도구 합쳐도 41.5% pass rate
- 멀티에이전트: recall↑(82.7%) but precision↓(48.8%)
- "Cry Wolf" 효과: 오탐 과다 → 개발자 피드백 포기

**주요 시스템**: CodeRabbit, HubSpot Sidekick, Qodo 2.0, Cursor BugBot

### R7: 분산 시스템 → AI 적용

**발표 요지**:
- **AI 환각 = 비잔틴 결함** — crash-tolerant(Raft/Paxos) 불충분
- Phi Accrual 품질 탐지기: 하트비트 → 품질 점수 분포, 3-sigma = 99.7% 신뢰
- 쿼럼: `flag_quorum + dismiss_quorum > total` → 모순 방지
- 펜싱 토큰: 교체된 에이전트의 stale 결과 거부
- CAP: 보안=CP(전원 대기), 문서=AP(가용성 우선)
- 가십 기반 크로스 체크 2-3라운드가 최적
- 리뷰 유형별 추천: 보안(5명, PBFT), 논리(3명, Raft), 스타일(3명, 다수결)

**주요 개념**: PBFT, Raft, Phi Accrual, 쿼럼, 펜싱, CAP, 가십 프로토콜

### R8: 프레임워크 추상화 설계

**발표 요지**:
- Registry + Strategy 패턴 (Terraform/pytest 영감)
- 이벤트 소싱: 리뷰 감사 추적 — 누가 뭘 말하고, 누가 기각하고, 왜
- Profile: K8s CRD 스타일 YAML, Docker Compose `extends` 상속
- LangGraph: 원리 차용, 의존성 추가 안 함 (Python 전용, 오버킬)
- 비용: Haiku→Sonnet→Opus 점진적 심화 (50-70% 절감)
- MVP ~550줄, Claude Code 스킬 우선 구현
- 하이브리드 오케스트레이션: 라운드는 오케스트레이션, 라운드 내 리뷰는 안무(choreography)

**주요 패턴**: Strategy, Registry, Event Sourcing, CQRS, Saga, Circuit Breaker

---

## 3. Round 1 취합 — 교차 합의

8명이 독립적으로 도달한 결론 중 교차 확인된 항목:

1. **독립 리뷰 → 투표 → 불확실한 것만 토론** (R1, R2, R6)
2. **에이전트 수 > 라운드 수** (R1, R2, R3)
3. **환각 = 비잔틴 결함, BFT급 프로토콜 필요** (R1, R7)
4. **기존 프레임워크에 상호 감시/동적 교체 없음** (R5)
5. **Judge Agent 프로덕션 보편적** (R6)
6. **LLM은 SLOP 못 잡음 → 패턴/도구 기반** (R4)
7. **Phi Accrual로 연속적 열화 감지** (R7)
8. **이벤트 소싱 + Registry, Claude Code 스킬로 MVP** (R8)

---

## 4. Round 2 — 크로스 체크 (3조)

### CC-1: R1(BFT) ↔ R2(Debate)

**검토 내용**: 소통 가치 vs 앙상블 효과, 라운드 수 불일치

**주요 발견**:
- **핵심 미해결 질문**: "구조화된 소통이 앙상블을 넘어서는 가치를 언제 추가하는가?" — R1은 과대, R2는 과소
- R1 "85.7% 결함률 100% 복구": 앙상블 효과 분리 안 됨, 적대적 결함 미검증
- R2 "투표 99%": 산술 도메인 특화, 일반화 위험
- 2-3라운드(R1,R2) vs 5-7라운드(R3): 과제 유형 차이 + "수렴 ≠ 최적 정확도" 구분 필요
- R1의 신뢰도 가중치는 "더 나은 앙상블"일 수 있으며, 소통 가치 입증은 아닐 수 있음

**결론**: 기본값은 투표. 토론은 경험적 테스트로 우위 확인 시에만 추가.

### CC-2: R4(SLOP) ↔ R5(코드분석) ↔ R6(프로덕션)

**검토 내용**: SLOP 탐지와 Judge Agent 모순, 실무 적용성

**주요 발견**:
- **"Judge Agent 보편적"은 과대 표현** — R6 자체 데이터(48.8% precision)가 R4의 회의론 확인
- **도구 기반 검증 > LLM 재확인**: R4(Tier1), R5(MetaGPT LGTM), R6(CodeRabbit grep) — 3명 독립 합의 (가장 강한 수렴)
- R5 "합의 없음"은 기술적으로 맞지만, 프로덕션은 비공식 합의 수행 중
- R4 임계값(3오류, 30% specificity): 근거 없는 공학적 기본값 — 캘리브레이션 필요
- 41.5% pass rate: 단일 에이전트 기준선 없어 해석 불가
- **핵심 통찰**: 파이프라인 순서 = 도구 검증 → 패턴 휴리스틱 → 타겟 LLM → 사람

**결론**: 도구 먼저, LLM 나중. 현재 프로덕션이 이걸 뒤집어 놓아서 precision이 낮음.

### CC-3: R3(Judge) ↔ R7(분산시스템) ↔ R8(프레임워크)

**검토 내용**: 이론 vs 아키텍처 현실성, MVP 규모, 비용

**주요 발견**:
- **R3의 "토론 정확도 증폭 증명" 과대 인용** — 이상화된 가정, R2의 앙상블 효과 반박이 더 설득력
- **MVP 550줄 → 800-1200줄**: 실제 코드베이스 분석으로 2-3배 과소 확인
- **저렴 모델(Haiku)은 판단 부적합** — 편향 높음, 생성에만 적합. 판단은 Sonnet+
- **KS 안정성 감지: MVP 규모에서 검정력 부족** — 단순 합의로 대체
- **Phi Accrual 콜드스타트 문제** — 캘리브레이션 데이터 필요, MVP에서는 rolling z-score
- **펜싱 토큰: 결과 수준만 구현 가능** — Gateway 수정 없이 사이드이펙트 보호 불가
- **⚠️ Critical 위험: 비결정성 + 상관 편향 = 반박 불가 합의** — 3명 동의해도 전부 같은 편향일 수 있음. 이종 모델(Claude+GPT+Gemini) 사용으로 완화.

**결론**: MVP 범위 축소, 판단은 Sonnet+, 이종 모델 다양성 필수.

---

## 5. 설계 수정 사항 (Round 2 반영)

| # | 기존 설계 | 수정 | 근거 |
|---|-----------|------|------|
| 1 | 토론 기반 크로스 체크 | **투표 기본 → 불확실한 것만 토론** | CC-1: 토론 이득 marginal |
| 2 | MVP ~550줄 | **800-1200줄** | CC-3: 실제 코드베이스 분석 |
| 3 | Haiku→Sonnet→Opus 전 단계 | **생성=Haiku, 판단=Sonnet+** | CC-3: 저렴 모델 판단 부적합 |
| 4 | KS 안정성 감지 | **MVP: 단순 합의** | CC-3: 소규모 검정력 부족 |
| 5 | Phi Accrual 건강 모니터 | **Phase 3, MVP=rolling z-score** | CC-3: 콜드스타트 |
| 6 | 펜싱 토큰 | **결과만, 사이드이펙트 미보호** | CC-3: Gateway 수정 불가 |
| 7 | (신규) 이종 모델 다양성 | **필수 권장** | CC-3: 상관 편향 위험 |

---

## 6. 미해결 질문 (후속 연구 필요)

1. **소통 vs 앙상블**: 동일 과제에서 "신뢰도 가중 투표(소통 없음)" vs "풀 프로토콜" head-to-head 비교
2. **Tier 1 단독 포착률**: 구조적 검증만으로 불량 결과 몇 %를 잡는가?
3. **이종 모델 편향 상관관계**: Claude + GPT + Gemini가 실제로 독립적인가?
4. **적대적 입력 대응**: LLM 맹점을 악용하는 코드에 대한 수렴 실패 시나리오

---

## 7. 등록된 이슈

- **#164**: 윈도우 신규 기능 호환성 (browser/panel/workspace/pty)
- **#165**: 멀티에이전트 상호검증 프레임워크

---

## 8. 산출물

| 산출물 | 경로 |
|--------|------|
| 프레임워크 설계 (초안) | `.agents/plans/cross-review-framework.md` |
| R5 상세 코드 분석 보고서 | `docs/reports/20260328-multi-agent-framework-source-analysis.md` |
| 본 회의록 | `docs/reports/20260328-multi-agent-research-minutes.md` |
| 윈도우 빌드 오버레이 설정 | `shell/src-tauri/tauri.conf.windows.json` |

---

## 9. 다음 단계

- [ ] 프레임워크 설계 문서에 Round 2 수정사항 반영
- [ ] 이슈 #165에 Round 2 결과 코멘트 추가
- [ ] Round 3 필요 여부 판단 (현재 핵심 위험 모두 식별됨)
- [ ] MVP 구현 시작 (Phase 1: 투표 기반 크로스 리뷰 스킬)
