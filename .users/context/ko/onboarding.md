# 개발자 온보딩 — 코드 철학 & AI 협업 가이드

> 미러: `.users/context/onboarding.md` (English)
> 이 문서는 Naia OS 프로젝트에 참여하는 **모든 기여자**(인간과 AI)를 위한 것입니다.

---

## 1. 설계 원칙 — 왜 이렇게 만드는가

이 프로젝트의 모든 규칙은 4가지 원칙에서 파생됩니다:

| 원칙 | 의미 | 실천 |
|------|------|------|
| **Simple** | 불필요한 복잡성 없이. 코드가 스스로 설명. | 최소한의 추상화. "무엇을" 설명하는 주석 불필요 — 코드가 설명. |
| **Robust** | 엣지 케이스 처리. 우아한 실패. | 테스트는 견고함을 검증하는 **진단 도구** — 통과시키는 점수판이 아님. |
| **Debuggable** | 모든 실패가 첫 발생부터 진단 가능. | 디버그 로깅은 **구현 중에** 추가 (빌드타임). 버그 후가 아님. |
| **Extensible** | 기존 코드 수정 없이 새 기능 추가. | Provider registry 패턴. 추상화는 4원칙의 도구이지 목적이 아님. |

**핵심 규칙**: 추상화는 이 4원칙을 달성하기 위한 도구이지, 추상화 자체가 목적이 아닙니다.

---

## 2. 컨텍스트 시스템 — 프로젝트의 "주석"

### 왜 컨텍스트 파일이 중요한가

전통적 개발에서는 코드 주석이 "왜"를 설명합니다. 이 프로젝트에서는 **컨텍스트 시스템** (`.agents/` + `.users/`)이 프로젝트 레벨에서 그 역할을 합니다.

- **코드** = "무엇을" 설명 (자기 문서화)
- **컨텍스트 파일** = "왜"를 설명 (설계 결정, 아키텍처, 철학)
- **코드 내 주석** = 최소한 — 비자명한 로직(워커라운드, 외부 제약)에만

### 구조

```
.agents/                    # AI 최적화 (영문, YAML/JSON)
├── context/                # 프로젝트 규칙, 아키텍처, 테스팅 전략
│   └── agents-rules.json   # 단일 진실 원천(SoT) ← 매 세션 읽기
├── workflows/              # 개발 프로세스
└── progress/               # 세션 핸드오프 파일 (gitignored)

.users/                     # 사람 읽기용 (Markdown)
├── context/                # .agents/context/ 영문 미러
│   └── ko/                 # 한국어 미러 (메인테이너 언어)
└── workflows/              # .agents/workflows/ 미러
```

**트리플 미러**: `.agents/` (AI) ↔ `.users/context/` (영문) ↔ `.users/context/ko/` (한국어). 변경 시 세 곳 모두 전파.

### 컨텍스트 정확성 = 코드 품질

컨텍스트가 잘못되면 모든 AI 세션이 잘못된 전제에서 시작합니다. 정확한 컨텍스트 유지는 올바른 코드 작성만큼 중요합니다.

---

## 3. 테스팅 철학

### 테스트는 진단 도구

테스트는 **시스템 상태를 이해하기 위해** 존재합니다. 초록색 체크마크를 만들기 위해서가 아닙니다.

- 실패하는 테스트 = **버그에 대한 정보** → 출력을 읽고, 근본 원인 진단
- 잘못된 assertion으로 통과하는 테스트 = **실패하는 테스트보다 나쁨** → 버그를 숨김

### 하지 말아야 할 것

| 안티패턴 | 왜 해로운가 |
|---------|-----------|
| assertion을 느슨하게 수정하여 통과시키기 | 실제 버그를 숨김 |
| expected value를 버그 있는 출력에 맞춰 변경 | 버그를 "정상"으로 인코딩 |
| 실패하는 테스트 삭제/스킵 | 진단 신호 제거 |
| 검증 내용을 읽지 않고 "통과"로 보고 | 거짓 자신감 |

### 테스트 코드 리뷰

테스트 코드 자체도 반복 리뷰(연속 2회 클린 패스) 후에야 결과를 신뢰합니다. 잘못된 테스트 로직이 실제 버그를 가립니다.

---

## 4. 관측성(Observability) — 빌드타임 로깅

디버그 로깅은 **빌드타임 활동**이지, 디버깅 타임 활동이 아닙니다.

새 코드 작성 시 다음에 로깅 추가:
- 모든 async 연산 (시작, 성공, 실패)
- 모든 상태 전환 (이전 → 이후)
- 모든 외부 호출 (API, IPC, 파일 I/O)
- 모든 에러 핸들링 경로

**이유**: 문제 발생 후에 로깅을 추가하면, 첫 번째 발생은 항상 진단 불가.

**릴리스 빌드에서 디버그 로그 제거** — 성능 비용 없음. 빌드타임 로깅을 생략할 이유 없음.

---

## 5. 개발 프로세스

### 기능 작업 (기본)

13단계: Issue → Understand (게이트) → Scope (게이트) → Investigate → Plan (게이트) → Build → Review → E2E Test → Post-test Review → Sync (게이트) → Sync Verify → Report → Commit

**게이트** = 사용자 확인 필수. **반복 리뷰** = 연속 2회 클린 패스 (1회 패스가 아님).

상세: `.agents/workflows/issue-driven-development.yaml`

### 간단한 변경

PLAN → CHECK → BUILD → VERIFY → CLEAN → COMMIT

상세: `.agents/workflows/development-cycle.yaml`

### E2E 테스트 실패 대응

**필수 첫 단계: DIAGNOSE** — 코드 수정 전에:
1. 테스트 출력 전문 읽기 (에러, 스택 트레이스, 실제 vs 기대값)
2. 테스트 assertion이 올바른지 확인
3. 근본 원인 식별 (구현 / 설계 / 조사 누락)
4. progress file의 test_findings에 기록

그 후 구체적 진단과 함께 해당 phase로 라우팅.

---

## 6. AI 행동 특성 인식

이 프로젝트는 AI 에이전트와 개발합니다. AI의 구조적 특성을 인식하고 보완해야 합니다:

| 경향 | 증상 | 대응 |
|------|------|------|
| **Optimistic code** | Happy path만 작성 | BUILD 중에 의식적으로 에러 경로 구현 |
| **Goal fixation** | 측정 가능한 목표(테스트 통과)에 수렴 | "목적이 뭐지?" 먼저 확인 |
| **Success bias** | 불확실한 상태를 "완료"로 보고 | 검증 안 됐으면 미완료 |
| **Front-back inconsistency** | 파일 앞부분과 뒷부분 코드 불일치 | 반복 리뷰로 일관성 검증 |

이건 비판이 아니라 — 인식하고 보완해야 할 구조적 특성입니다.

---

## 7. 빠른 참조

| 무엇 | 어디 |
|------|------|
| 프로젝트 규칙 (SoT) | `.agents/context/agents-rules.json` |
| 테스팅 전략 | `.agents/context/testing.yaml` |
| 기능 워크플로우 | `.agents/workflows/issue-driven-development.yaml` |
| 간단한 변경 워크플로우 | `.agents/workflows/development-cycle.yaml` |
| 하네스 (훅, progress) | `.agents/context/harness.yaml` |
| 교훈 기록 | `.agents/context/lessons-learned.yaml` |
| 이 문서 (영문) | `.users/context/onboarding.md` |
