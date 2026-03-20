# IssueDesk — 설계 문서

> 관련 이슈: [#91](https://github.com/nextain/naia-os/issues/91) · [#89](https://github.com/nextain/naia-os/issues/89)
> 작성일: 2026-03-20 · 상태: 초안 (설계 검토 중)

---

## 목차

1. [문제 정의](#1-문제-정의)
2. [요구사항](#2-요구사항)
3. [기능 요구사항](#3-기능-요구사항)
4. [디자인 컨셉](#4-디자인-컨셉)
5. [사용자 시나리오](#5-사용자-시나리오)
6. [확장성 설계](#6-확장성-설계)
7. [참고 자료 및 근거](#7-참고-자료-및-근거)

---

## 1. 문제 정의

### 1.1 현재 상황

Luke는 아래 레포를 동시에 관리한다.

| 레포 | 성격 |
|------|------|
| nextain/naia-os | 메인 프로젝트 |
| nextain/naia.nextain.io | 웹 서비스 |
| nextain/admin.nextain.io | B2B 어드민 |
| nextain/aiedu.nextain.io | 교육 플랫폼 |
| nextain/about.nextain.io | 코퍼레이트 사이트 |
| nextain/any-llm | LLM SDK/게이트웨이 |
| nextain/vllm | 업스트림 기여 포크 |
| luke-n-alpha/whisper-rs | Codeberg 포크 |

오픈 이슈만 수십 개. 이슈 주도 개발(IDD) 13단계 워크플로우를 쓰기 때문에 각 이슈가 어느 단계인지도 추적해야 한다.

### 1.2 핵심 고통점

**1. "지금 뭐부터 해야 하지?"**
레포마다 GitHub를 따로 열어서 이슈 목록을 뒤져야 한다.
우선순위 라벨(P1/P2/P3)은 붙여놨지만 실제 지금 상황을 반영하지 못한다.

**2. "저 이슈 어디까지 했더라?"**
며칠 만에 돌아온 이슈는 처음부터 다시 읽어야 한다.
progress.json 파일이 있지만 직접 열어봐야 한다.

**3. "PR 팔로업이 있나?"**
외부 오픈소스에 기여한 PR(whisper-rs #275, vllm 등)에 리뷰가 달렸는지 알 수 없다.

**4. "유저가 뭘 원하는지?"**
GitHub reactions, Discord 피드백이 흩어져 있다.
내가 중요하다고 생각하는 것과 유저가 원하는 것이 다를 수 있다.

**5. "외부 커뮤니티에 뭐라고 답해야 하나?"**
vllm, whisper-rs 같은 커뮤니티마다 톤이 다르다.
어색한 답변을 달면 기여가 묻힐 수 있다.

**6. "실제로 내가 뭘 신경 쓰고 있나?"**
P3로 분류해놨는데 자꾸 열어보는 이슈가 있다.
이게 실제로는 더 중요하다는 신호인데 놓치고 있다.

### 1.3 문제의 근본 원인

```
정보가 흩어져 있다   →   수집 비용이 높다   →   컨텍스트 스위칭이 잦다
                                                          ↓
                                              중요한 것이 묻힌다
                                                          ↓
                                      무엇을 해야 할지 모르는 상태가 된다
```

---

## 2. 요구사항

### 2.1 핵심 목표

> "지금 뭘 해야 하는지" Naia가 알고 있고, 물으면 바로 알려줄 수 있는 상태.

### 2.2 기능 요구사항 요약

| # | 요구사항 | 우선순위 |
|---|---------|---------|
| F1 | 여러 레포의 이슈를 한 화면에서 본다 | P1 |
| F2 | PR 상태를 한 곳에서 추적한다 | P1 |
| F3 | Naia에게 "뭐부터?" 물으면 답을 준다 | P1 |
| F4 | 유저 피드백(reactions, Discord)을 이슈와 연결한다 | P2 |
| F5 | 내 열람 패턴으로 실제 관심 이슈를 감지한다 | P2 |
| F6 | GTD 빠른 캡처로 아이디어를 잃지 않는다 | P2 |
| F7 | WIP 한도를 설정해 동시 진행 이슈를 제한한다 | P2 |
| F8 | RICE 점수를 AI가 초안 잡아준다 | P2 |
| F9 | 아침 브리핑 — 어젯밤 변경사항 요약 | P2 |
| F10 | 이슈 재개 브리핑 — "여기까지 했어요" | P2 |
| F11 | 외부 커뮤니티 댓글 초안 — 톤 매칭 | P2 |
| F12 | 이슈 진행 상황 GitHub 코멘트 자동 작성 | P3 |
| F13 | 알림 트리아지 — "내 액션 필요" vs "FYI" | P3 |
| F14 | 크로스레포 임팩트 사전 감지 | P3 |
| F15 | 속도 학습 — 유사 이슈 소요 시간 기반 예측 | P3 |
| F16 | 이슈 닫기 시 lessons-learned 자동 연결 제안 | P3 |

### 2.3 비기능 요구사항

- **GitHub API rate limit 대응**: GraphQL 배치 쿼리 + 로컬 캐시 (IndexedDB)
- **Codeberg 지원**: whisper-rs 등 Codeberg 레포는 Gitea API 별도 처리 (GitHub GraphQL 불가)
- **인증**: GitHub PAT (Personal Access Token) → Zustand persist (`localStorage`, key: `issue-desk-store`). OAuth는 v2 검토
- **오프라인 동작**: 캐시된 데이터로 기본 뷰 유지 (마지막 동기화 시각 표시)
- **성능**: 초기 로드 3초 이내 (캐시 히트 기준), 백그라운드 폴링 주기 5분
- **Tauri/WebKitGTK 호환**: 기존 shell 아키텍처 준수
- **확장성**: 솔로 개발자 v1 → 팀 v2 확장 가능 구조 (플러그인 레이어)
- **레포 목록**: 설정 파일에서 관리 (하드코딩 금지)
- **행동 추적 opt-out**: 열람 패턴 추적은 기본 활성화, 설정에서 비활성화 가능

---

## 3. 기능 요구사항

### 3.1 멀티레포 이슈 대시보드 `F1`

**개요**: 여러 레포의 이슈를 하나의 뷰에 통합한다.

**상세 기능**:
- 레포 / 라벨 / 우선순위 / 단계별 필터
- **IDD 단계 표시**: progress.json을 읽어 각 이슈의 현재 단계(issue → commit 중 어디인지) 표시
  - 파일명 규칙: `.agents/progress/{issue-slug}.json` (예: `issue-91-issue-desk.json`)
  - progress.json은 gitignore됨 (세션 로컬) → 없으면 "단계 정보 없음" 표시
- **활성 워크트리 표시**: 지금 작업 중인 이슈 강조
  - `git worktree list` 파싱으로 감지 (Tauri sidecar 명령)
- **의존성 시각화**: "blocked by #X" 체인 표시
- **이슈 고령화**: 마지막 활동 기준 색상 표시 (최신 → 오래됨)
- **이슈 건강도 체크**: 시작 가능한 상태인지 판단
  - AC(수락 기준) 정의됨?
  - 재현 방법 있음? (버그의 경우)
  - 이슈 범위가 너무 넓음? ("쪼개기 필요" 경고)
- **Now / Next / Someday 트리아지**: GTD 방식 3단계 분류
  - [참고: GTD 방법론](https://gettingthingsdone.com/)

### 3.2 PR 트래킹 `F2`

**개요**: 내가 관여된 모든 PR 상태를 한 곳에서 본다.

**상세 기능**:
- **내 PR**: nextain/* 레포 오픈 PR 전체
- **기여 PR**: 외부 업스트림 레포에 제출한 PR (nextain/vllm → vllm-project/vllm 등)
  - Codeberg PR (whisper-rs #275 등): Gitea REST API 별도 호출
  - 추적 대상 레포/PR은 설정에서 수동 등록 (자동 감지 v2)
- **상태 표시**: 리뷰 대기 / 변경 요청 / 승인 / 머지됨
- **침묵 감지**: N일 이상 응답 없는 PR → "팔로업 고려" 알림
- **리뷰 요청 수신**: 내가 리뷰어로 지정된 PR

### 3.3 유저 피드백 레이어 `F4`

**개요**: 유저가 실제로 원하는 것을 이슈에 연결한다.

**상세 기능**:
- **GitHub reactions 집계**: 👍 수 기준 유저 수요 표시
- **Discord 피드백 연결**: #6 Discord→이슈 자동 생성과 연동, 패널에서 원본 피드백 보기
  - ⚠ 의존성: [#6](https://github.com/nextain/naia-os/issues/6) 미구현
  - Graceful degradation: #6 없을 때 reactions만 표시, Discord 섹션은 "연결 안 됨" 표시
- **중복 불만 클러스터링**: 비슷한 피드백 여러 건 → 하나의 이슈로 묶기 (Naia가 감지)
- **우선순위 갭 표시**: 개발자 라벨(P3) vs 유저 반응(👍 50개) 불일치 강조

> 근거: 유저 행동 패턴이 명시적 피드백보다 심각도 예측에 더 신뢰도 높음
> ([arXiv:2508.00593](https://arxiv.org/html/2508.00593))

### 3.4 행동 기반 우선순위 `F5`

**개요**: 내가 자주 건드리는 것 = 실제로 중요한 것.

**상세 기능**:
- **열람 빈도 추적**: 이슈별 방문 횟수 + 체류 시간 로컬 기록 (IndexedDB)
- **선언적 vs 행동적 우선순위 갭**: P3인데 이번 주 8번 열어봤으면 강조
- **"내 관심 이슈" 뷰**: 행동 데이터 기반 자동 정렬
- **주간 히트맵**: 어떤 이슈에 얼마나 집중했는지 시각화
- **집중 영역 분석**: "이번 주 naia-os에 70%, vllm에 20%"
- **Naia 넛지**: "이번 주 #79를 5번 봤어요 — 우선순위 올릴까요?"

> 근거: Priority State Space (PSS) Framework — 선택 이력이 자동으로 우선순위 편향 생성
> ([PubMed: 28863855](https://pubmed.ncbi.nlm.nih.gov/28863855/))

### 3.5 개인 워크플로우 레이어 `F6 F7 F8`

#### 3.5.1 GTD 빠른 캡처 `F6`
- 어디서든 아이디어 → 인박스에 즉시 던져넣기
- Naia가 나중에 Clarify: "이게 actionable해? 다음 액션이 뭐야?"
- **2분 규칙**: 바로 처리 가능한 이슈 별도 표시
- [참고: GTD 방법론](https://www.todoist.com/productivity-methods/getting-things-done)

#### 3.5.2 WIP 한도 (Personal Kanban) `F7`
- 동시 진행 이슈 최대 N개 설정 (기본값: 3)
- 한도 초과 시 경고 — "지금 4개 진행 중이에요 (한도: 3)"
- [참고: Personal Kanban](https://www.nimblework.com/kanban/personal-kanban/)

#### 3.5.3 RICE 점수 (AI 지원) `F8`
- `(Reach × Impact × Confidence) / max(Effort, 1)`
- 사용자가 슬라이더로 직접 입력 → 점수 자동 계산 (Reach/Impact/Confidence: 0~10, Effort: 1~10)
- Naia 초안 제안은 Phase 3 (NaiaContextBridge) 이후
- 레포 간 이슈를 RICE 기준으로 비교
- [참고: RICE Scoring — Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/)

#### 3.5.4 Eisenhower Q2 보호 트레이
- 중요하지만 긴급하지 않은 이슈 전용 공간
- "지금 당장은 아니지만 반드시 해야 할 것"이 묻히지 않게
- [참고: Eisenhower Matrix — Asana](https://asana.com/resources/eisenhower-matrix)

### 3.6 일상 흐름 지원 `F9 F10 F12`

#### 3.6.1 아침 브리핑 `F9`
트리거: 하루 첫 Work Intelligence 패널 포커스 시 (타임존 기준 자정 리셋)
Naia가 자동으로:
- "어젯밤 X 이슈에 리뷰 달렸어요"
- "새 이슈 3개 열렸어요 (naia-os 2개, vllm 1개)"
- "오늘 집중 추천: #91 (WIP 한도 내, P1, 재개 가능)"

#### 3.6.2 이슈 재개 브리핑 `F10`
오랜만에 이슈를 클릭하면:
- "3일 전 Plan 단계에서 멈췄어요"
- "마지막 결정: Provider registry 패턴 채택"
- "다음 할 일: Dynamic voice fetch 구현"
- (progress.json + 마지막 GitHub 코멘트 기반)

#### 3.6.3 컨텍스트 자동 보존 `F12` _(Phase 7 구현)_
이슈 탭 닫을 때:
- "여기까지 진행했어요. GitHub 코멘트로 기록할까요?"
- Naia 대화 중 중요한 결정 → 이슈 코멘트 자동 아카이브 옵션

### 3.7 업스트림 커뮤니티 어시스턴트 `F11`

**개요**: 오픈소스 기여 시 커뮤니티 맥락에 맞는 소통을 돕는다.

**상세 기능**:
- **톤 매칭**: 커뮤니티별 스타일 학습 (CONTRIBUTING.md + 과거 코멘트 분석)
  - vllm: 기술적 RFC 스타일, 간결
  - whisper-rs: 캐주얼, 친근
- **댓글 초안 생성**: "리뷰어가 X라고 했는데 뭐라고 답해?" → Naia 초안 제안
- **AI 작성 disclosure 자동 포함** (agents-rules.json 정책)
- **커뮤니티 컨텍스트 저장**: 레포별 소통 스타일 로컬 캐시

> 배경: 외부 커뮤니티 기여 시 기술적 정확성만큼 톤이 중요
> (agents-rules.json `community_context_first` 정책)

### 3.8 알림 트리아지 `F13`

- GitHub 알림 → "내 액션 필요" / "FYI" / "무시 가능" 분류
- 일일 배치 다이제스트 (실시간 노이즈 없이)
- 침묵 중인 PR/이슈 감지 → 팔로업 제안

### 3.9 크로스레포 임팩트 `F14`

- naia-os 변경이 any-llm에 영향을 줄 때 사전 표시
- "이 수정은 3개 레포 동시 변경이 필요해요" 미리 경고

### 3.10 속도 학습 `F15`

- 이슈 완료 시 소요 시간 기록 (시작 ~ 닫기 간격, IndexedDB)
- 유사 이슈(라벨/타입 기준) 과거 소요 시간 기반 예측
- "이 타입 이슈 평균 2.5일" 참고 표시

### 3.11 이슈 닫기 연계 `F16`

- 이슈 닫기 전 체크리스트: lessons-learned 기록 제안, 관련 이슈 코멘트, 최종 GitHub 코멘트
- lessons-learned 항목 → `.agents/context/lessons-learned.yaml` 자동 링크

### 3.12 Naia 종합 판단 `F3`

**개요**: F1·F4·F5 데이터를 종합해 "지금 뭘 해야 하는지" 답한다.

- 입력: GitHub 이슈 상태 + 유저 reactions + 행동 빈도 + PR 팔로업 필요 여부
- 출력: 우선순위 추천 3개 (즉시/집중/주의) + 근거 설명
- "시작해줘" 발화 → 워크트리 생성 + 컨텍스트 로드

---

## 4. 디자인 컨셉

### 4.1 핵심 철학

> "눈에 보이는 것만 관리할 수 있다."
> 흩어진 정보를 모아서 보여주고, Naia가 의미를 해석해준다.

### 4.2 UI 레이아웃

기존 naia-os 패널 시스템(#89) 위에 올린다.

```
┌────────────────────────────────────────────────────────────┐
│  Naia 패널 (좌측, 기존)   │  Work Intelligence (우측, 신규) │
│                           │                                 │
│  [Naia 아바타]            │  [필터바: 레포 | 라벨 | 단계]  │
│                           │                                 │
│  [채팅]                   │  [이슈 목록]                    │
│  "뭐부터 해야 해?"        │  ■ #91 issue-desk  P1   │
│                           │    ↳ 단계: Plan ✓ | 활성 워크트리│
│  "오늘 집중 추천:         │  ■ #79 vLLM STT       ⚠ 5회  │
│   #91 (P1, Plan 완료,    │    ↳ 단계: Build | 주 5회 조회  │
│   워크트리 있음)"         │  ■ #51 STT/TTS        👍 12   │
│                           │    ↳ 단계: E2E | 유저 반응 높음 │
│  [빠른 캡처 버튼]         │                                 │
│                           │  [우측 상세 패널]               │
│                           │  이슈 요약 | 결정 이력 | 파일  │
└────────────────────────────────────────────────────────────┘
```

### 4.3 뷰 모드

| 뷰 | 설명 |
|----|------|
| **집중 뷰** (기본) | WIP 한도 내 진행 중 이슈만 표시 |
| **전체 뷰** | 모든 이슈, 필터 가능 |
| **Now/Next/Someday** | GTD 3단계 트리아지 뷰 |
| **내 관심 뷰** | 행동 데이터 기반 정렬 |
| **유저 목소리 뷰** | reactions 수 기준 정렬 |
| **PR 뷰** | 내 PR + 기여 PR |
| **아침 브리핑** | 앱 시작 시 자동 표시 |

### 4.4 인터랙션 패러다임

**대화 + 직접 조작 혼합**
- Naia에게 말로 → 이슈 생성, 우선순위 조정, 시작
- 직접 클릭/드래그도 동일하게 지원 (Naia 전용 아님)

**학습하는 패널**
- 열람 패턴을 로컬에 조용히 기록
- 주간 단위로 패턴 요약 제안
- 강제 없이 제안만 (Luke가 결정)

---

## 5. 사용자 시나리오

### 시나리오 1: 아침 시작

```
상황: 월요일 아침, Naia OS 실행

Naia: "좋은 아침이에요. 주말 동안 변경된 것들:
      - #91 issue panel: 코멘트 2개 달림 (리뷰 의견)
      - whisper-rs PR #275: 리뷰어가 변경 요청했어요
      - naia-os 새 이슈 1개: #97 (voice pipeline tools)

      오늘 추천 집중:
      1. whisper-rs PR 응답 (리뷰어 기다리는 중)
      2. #79 vLLM STT (지난주 가장 많이 본 이슈)"

Luke: "whisper-rs PR 먼저 보여줘"

→ PR 트래킹 뷰로 이동, 리뷰어 코멘트 표시
→ Naia: "이 코멘트에 뭐라고 답할지 초안 잡아줄까요?"
```

### 시나리오 2: 이슈 재개

```
상황: #79를 4일 만에 클릭

Naia: "4일 전에 Build 2단계에서 멈췄어요.
      마지막 결정: WebKitGTK AudioContext sampleRate 이슈로
      SW 다운샘플 방식으로 변경.
      다음 할 일: sttInputDeviceId getUserMedia 연결.

      관련 파일: shell/src/lib/stt/registry.ts:45
      바로 시작할까요?"

Luke: "응"

→ 워크트리 자동 생성, 관련 파일 오픈
  (이미 워크트리 있으면 → "기존 워크트리 있어요. 열까요?" 확인 후 재사용)
```

### 시나리오 3: 우선순위 혼란

```
상황: 이슈가 너무 많아서 뭘 해야 할지 모르는 상황

Luke: "지금 뭐부터 해야 해?"

Naia: "현재 신호들 종합:

      즉시 처리:
      → whisper-rs PR: 리뷰어 5일 기다리는 중 (관계 관리)

      집중 권장:
      → #79: 이번 주 5회 조회 (실제 관심) + P2 + Build 중

      주의: P1인데 못 건드리고 있는 것:
      → #91: Plan 완료됐는데 2주째 미착수"

Luke: "#91 지금 시작하자"
→ 워크트리 생성, 컨텍스트 로드
```

### 시나리오 4: 빠른 캡처

```
상황: #79 작업 중 다른 아이디어가 떠오름

Luke: (빠른 캡처 버튼) "vllm 게이트웨이에서 STT 스트리밍 지원되면 좋을텐데"

→ 인박스에 저장, 현재 작업 방해 없음

[나중에 인박스 정리할 때]
Naia: "'vllm STT 스트리밍' — 이게 #79 서브태스크인가요,
       아니면 새 이슈로 만들까요?
       비슷한 이슈: #80 (on-demand vLLM management)"
```

### 시나리오 5: 외부 PR 코멘트

```
상황: vllm PR에 리뷰어가 기술적 코멘트를 달았음

Luke: "이 코멘트 어떻게 답하지?"
(vllm 리뷰어 코멘트를 패널에서 클릭)

Naia: "vllm 커뮤니티는 RFC 스타일 선호해요.

       초안:
       'Thanks for the review. You're right that [X] —
       I've updated the implementation to [Y].
       The key change is in [파일:라인].
       Let me know if this addresses your concern.'

       🤖 Written with AI assistance.
       보내기 전에 내용 맞는지 확인해주세요."
```

### 시나리오 6: 이슈 마무리

```
상황: #60 LLM Provider Registry 완료 후 이슈 닫으려 함

Naia: "이슈 닫기 전에:
       1. 이번 작업에서 배운 것 있으면 기록해둘까요?
          (lessons-learned.yaml 자동 연결)
       2. 관련 이슈 #64, #78에 영향 있으면 코멘트 달까요?
       3. 진행 상황 최종 코멘트 GitHub에 달까요?"
```

### 시나리오 7: 유저 피드백 발견

```
상황: P3 라벨 이슈인데 GitHub reactions이 많음

패널: [#46 음성 대화 파이프라인]
      라벨: P3 (개발자 분류)
      👍 reactions: 34개  ← 유저 수요 신호
      ⚠ "우선순위 갭 감지됨"

Naia: "#46이 P3로 분류됐지만 유저 반응이 높아요 (👍 34).
       P2로 올리는 것 고려해볼까요?"
```

---

## 6. 확장성 설계

### 6.1 아키텍처 레이어

```
┌─────────────────────────────────────────────────────┐
│                    UI Layer                          │
│   솔로 뷰 (기본)  |  팀 뷰 (config 플래그로 활성화) │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│              Priority Engine (플러그인)              │
│  v1 솔로: 행동신호 + RICE + Eisenhower              │
│  v2 팀:   + 담당자 분산 + 팀 벨로시티 (추가)        │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│              Naia Context Layer                      │
│  v1: "내가 다음에 뭘 해야 해?"                      │
│  v2: "우리 팀이 다음에 뭘 해야 해?" (프롬프트 교체) │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│              Data Layer (추상화)                     │
│  GitHub GraphQL API → 멀티레포 통합 수집             │
│  로컬 캐시: IndexedDB (db.ts 활용)                  │
│  행동 로그: IndexedDB → (v2) 팀 서버               │
└─────────────────────────────────────────────────────┘
```

### 6.2 v1 (솔로 개발자) — 이번 구현

- 단일 사용자 기준
- 행동 데이터 로컬 저장
- GitHub 개인 토큰 인증
- WIP 한도, RICE, GTD 개인 뷰

### 6.3 v2 (팀 기반) — 별도 이슈

> 별도 이슈로 추후 분리 예정

- 멀티 유저 WIP 한도 및 담당자 분산
- 팀 벨로시티 트래킹
- 스탠드업 자동 요약 (Slack/Discord 연동)
- 팀원 간 이슈 재배분 제안
- 이해관계자 보고 자동화

---

## 7. 참고 자료 및 근거

### 생산성 방법론

| 방법론 | 적용 기능 | 참고 |
|--------|---------|------|
| GTD (Getting Things Done) | 빠른 캡처, 2분 규칙, 인박스 | [Todoist GTD 가이드](https://www.todoist.com/productivity-methods/getting-things-done) |
| Personal Kanban | WIP 한도, 단일 보드 뷰 | [NimbleWork](https://www.nimblework.com/kanban/personal-kanban/) |
| Eisenhower Matrix | Q2 보호 트레이, 긴급/중요 분류 | [Asana](https://asana.com/resources/eisenhower-matrix) |
| RICE Scoring | AI 지원 우선순위 점수 | [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/) |

### AI 기반 PM 툴 참고

| 툴 | 참고한 기능 |
|----|---------|
| [Linear AI](https://linear.app/ai) | 중복 감지, 주간 다이제스트, MCP 통합 |
| [GitHub Copilot Coding Agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | 이슈 → 에이전트 할당 패턴 |
| [Plane (오픈소스)](https://github.com/makeplane/plane) | GitHub 양방향 동기화 레퍼런스 |

### 학술/연구 근거

| 주제 | 근거 | 링크 |
|------|------|------|
| 행동 신호 = 우선순위 신호 | Priority State Space Framework (인지과학) | [PubMed 28863855](https://pubmed.ncbi.nlm.nih.gov/28863855/) |
| 암묵적 피드백의 신뢰도 | 10억 사용자 시스템 분석 — 행동 패턴이 명시적 피드백보다 신뢰도 높음 | [arXiv 2508.00593](https://arxiv.org/html/2508.00593) |

### 프로젝트 내부 근거

| 항목 | 위치 |
|------|------|
| IDD 13단계 워크플로우 | `naia-os/.agents/workflows/issue-driven-development.yaml` |
| progress.json 구조 | `naia-os/AGENTS.md` → Progress File 섹션 |
| Discord 피드백 → 이슈 | [naia-os #6](https://github.com/nextain/naia-os/issues/6) |
| 외부 커뮤니티 기여 정책 | `naia-os/.agents/context/agents-rules.json` → `community_context_first` |
| 패널 시스템 기반 | [naia-os #89](https://github.com/nextain/naia-os/issues/89) |

---

## 8. 페이즈 설계

### 원칙

- 각 페이즈는 독립적으로 테스트 가능한 경계에서 분리
- 앞 페이즈 없이 뒷 페이즈 시작 불가 (의존성 준수)
- 각 페이즈 완료 = 동작하는 소프트웨어 (문서/플레이스홀더 아님)
- P1 기능 먼저, P3는 마지막

---

### Phase 1 — Shell 통합 + 데이터 기반 `F1 기초`

**목표**: 패널이 shell에 등록되고, 여러 레포의 이슈가 화면에 나온다.

**구현 범위**:
- `nextain/issue-desk` 독립 레포 (Vite + React + Zustand), `panel.json` + 빌드된 `index.html`로 shell에 iframe 통합
- GitHub REST/GraphQL API 클라이언트 (`src/github/api.ts`)
  - 멀티레포 이슈 조회
  - Rate limit 핸들링 + retry
- IndexedDB 스키마 정의 (`src/db/index.ts` — shell과 same-origin iframe으로 공유)
  - `issues` 테이블 (repo, number, title, labels, state, updatedAt, reactions)
  - `prs` 테이블 (repo, number, title, state, updatedAt, author)
  - `behavior_log` 테이블 (issueId, viewedAt, durationMs)
  - `cache_meta` 테이블 (lastSyncAt per repo)
- GitHub PAT 저장 (Zustand persist, `localStorage` key: `issue-desk-store`)
- 기본 이슈 목록 UI (레포 / 라벨 / 상태 필터)
- 설정 UI: 추적할 레포 목록 관리

**완료 기준**:
- naia-os, naia.nextain.io 등 복수 레포 이슈가 하나의 목록에 표시됨
- 필터(레포/라벨/state) 동작
- 오프라인 시 캐시된 데이터 표시 + "마지막 동기화: N분 전" 표시

---

### Phase 2 — PR 트래킹 `F2`

**목표**: 내 PR과 기여 PR 상태를 한 곳에서 본다.

**구현 범위**:
- GitHub Search REST API: `is:pr+is:open+author:{username}` 쿼리 (내 PR), 리뷰 상태 별도 조회
- Codeberg Gitea REST API 클라이언트 (`src/gitea/api.ts`)
  - `GET /api/v1/repos/{owner}/{repo}/pulls/{index}` — 기여 PR 개별 조회
  - Codeberg PAT 저장 (Zustand persist, 선택 입력)
- 설정 UI: 기여 PR 수동 등록 (레포 + PR 번호)
- PR 뷰 UI: 상태 배지(리뷰 대기 / 변경 요청 / 승인 / 머지), 마지막 활동 시각
- 침묵 감지: `lastActivityAt` 기준 N일 경과 → 알림 배지

**완료 기준**:
- 내 PR 목록 + 등록된 기여 PR 목록 표시
- Codeberg PR (whisper-rs #275) 상태 표시
- N일 침묵 PR에 ⚠ 배지 표시

---

### Phase 3 — Naia 기본 통합 `F3 F9 F10`

**목표**: Naia가 "뭐부터?"에 답하고, 이슈 재개를 도와준다.

**구현 범위**:
- `NaiaContextBridge` 확장: 패널 → Naia 이슈 컨텍스트 전달 인터페이스
- **아침 브리핑** (F9)
  - 하루 첫 패널 포커스 시 트리거 (IndexedDB `last_briefing_date` 비교)
  - 마지막 동기화 이후 변경사항 집계 → Naia에게 요약 생성 요청
- **이슈 재개 브리핑** (F10)
  - 이슈 클릭 시 `progress.json` 파싱 (Tauri `fs` API)
  - `progress.json` 없으면 마지막 GitHub 코멘트 기반으로 fallback
  - Naia에게 "여기까지 했어요" 요약 생성 요청
- **워크트리 감지**
  - Tauri `shell` sidecar: `git worktree list --porcelain` 파싱
  - 이슈 번호 ↔ 브랜치명 매핑 (`issue-{N}-*` 패턴)
- **"뭐부터?" 종합 판단** (F3)
  - 입력: PR 팔로업 필요 여부 + P-label + IDD 단계 + 워크트리 상태
  - Naia 프롬프트 구성 → 우선순위 추천 3개 출력
- **"시작해줘" 액션**: Naia 응답에서 이슈 번호 파싱 → worktree 생성 명령

**완료 기준**:
- 앱 열면 "좋은 아침, 변경사항: …" Naia 브리핑
- 이슈 클릭 시 "N일 전 여기까지 했어요" 요약
- "뭐부터?" 질문에 3개 추천 + 근거
- "시작해줘" → 워크트리 생성 또는 기존 워크트리 재사용 확인

---

### Phase 4 — 행동 기반 우선순위 `F5`

**목표**: 내가 자주 보는 것이 실제로 중요하다는 것을 화면으로 보여준다.

**구현 범위**:
- 이슈 뷰 이벤트 로깅: 클릭 시 `behavior_log` 기록 (issueId, timestamp, duration)
- 주간 집계 뷰: 이슈별 열람 횟수 + 체류 시간 합산
- **우선순위 갭 감지**: P-label과 열람 빈도 불일치 → 이슈 카드에 ⚠ 표시
- **"내 관심 이슈" 뷰 모드**: 열람 빈도 × 체류 시간 합산 점수 정렬
- **집중 영역 분석**: 레포별 집중 비율 (주간)
- **Naia 넛지**: 행동 데이터 → F3 입력에 추가 (갭 이슈 강조)
- 행동 추적 opt-out 설정 항목

**완료 기준**:
- P3 이슈를 10회 이상 열면 ⚠ 갭 배지 표시
- "내 관심 뷰"에서 열람 많은 이슈가 상위 정렬
- 주간 레포 집중 비율 표시
- "뭐부터?" 답변에 행동 신호 반영

---

### Phase 5 — 개인 워크플로우 `F6 F7 F8`

**목표**: GTD 캡처, WIP 한도, RICE 점수가 동작한다.

**구현 범위**:
- **빠른 캡처** (F6)
  - N 키 단축키 (window keydown, iframe 환경으로 Tauri globalShortcut 불가) → 인박스 입력 팝업
  - 인박스 목록 UI (미처리 / 처리 완료 섹션)
  - Naia Clarify 플로우 및 이슈 생성 연결은 Phase 3 (NaiaContextBridge) 이후
- **WIP 한도** (F7)
  - 설정: 최대 동시 진행 이슈 수 (기본 3)
  - 사용자 수동 WIP 마킹 (▶ 시작 버튼); IDD 단계 자동 감지는 #98 NaiaContextBridge 이후
  - 한도 초과 시 이슈 시작 시도할 때 경고 모달
- **RICE 점수** (F8)
  - 이슈 카드 인라인 슬라이더 패널 (Reach/Impact/Confidence: 0~10, Effort: 1~10)
  - 점수 자동 계산: `(R×I×C)/max(E,1)` (Math.round)
  - RICE순 정렬 뷰 모드
  - Naia 초안 제안은 Phase 3 이후
- **Now/Next/Someday 트리아지 뷰**
  - 이슈를 3개 버킷으로 drag-drop 분류
  - 분류 정보 IndexedDB 저장

**완료 기준**:
- 단축키로 캡처 팝업 열고 인박스 저장
- WIP 4개 시도 시 경고
- RICE 점수 입력 후 레포 간 정렬
- Now/Next/Someday 분류 후 새로고침에도 유지

---

### Phase 6 — 유저 피드백 + 커뮤니티 `F4 F11 F13`

**목표**: 유저가 원하는 것과 커뮤니티 소통을 돕는다.

**구현 범위**:
- **GitHub reactions** (F4)
  - 이슈 카드에 👍 수 표시
  - 개발자 라벨 vs reactions 갭 감지 + F3 입력 반영
  - Discord 연동: #6 완료 후 활성화 (현재 stub + "연결 안 됨" 표시)
- **커뮤니티 어시스턴트** (F11)
  - 레포별 커뮤니티 프로필 (CONTRIBUTING.md 요약, 톤 메모) 로컬 저장
  - PR/이슈 코멘트 클릭 → "답변 초안 생성" 버튼
  - Naia 프롬프트: 커뮤니티 프로필 + 원본 코멘트 + AI disclosure 자동 삽입
- **알림 트리아지** (F13)
  - GitHub Notifications API 폴링
  - 분류: `review_requested` / `mention` / `assign` → "내 액션"
  - 나머지 → "FYI" 접힌 목록
  - 일일 배치 다이제스트 뷰

**완료 기준**:
- 이슈 카드에 reactions 수 표시 + 갭 이슈 강조
- PR 코멘트 클릭 → 커뮤니티 톤 맞춘 초안 생성
- 알림 목록 "내 액션 필요" / "FYI" 분리

---

### Phase 7 — 고급 기능 `F12 F14 F15 F16`

**목표**: 자동화와 학습 기능으로 패널을 더 스마트하게 만든다.

**구현 범위**:
- **자동 GitHub 코멘트** (F12)
  - 이슈 탭 닫을 때 "진행 상황 기록할까요?" 제안
  - Naia 대화에서 결정 사항 → "이슈 코멘트로 아카이브" 버튼
- **크로스레포 임팩트** (F14)
  - 레포 간 의존성 맵 설정 (any-llm ↔ naia-os 등)
  - 이슈 시작 시 영향 레포 경고 표시
- **속도 학습** (F15)
  - 이슈 시작일 ~ 닫힌 날 간격 기록 (behavior_log 활용)
  - 라벨/타입 기준 유사 이슈 평균 소요 시간 집계
  - 이슈 상세 패널에 "평균 N일 소요" 표시
- **이슈 닫기 연계** (F16)
  - 이슈 닫기 버튼 → 체크리스트 모달
  - lessons-learned 입력 → `.agents/context/lessons-learned.yaml` append
  - 관련 이슈 코멘트 일괄 작성 옵션

**완료 기준**:
- 이슈 닫으면 체크리스트 모달 표시
- lessons-learned.yaml에 항목 추가됨
- 유사 이슈 3개 이상 닫은 후 "평균 N일" 표시

---

### 페이즈 요약

| Phase | 기능 | P 수준 | 검증 방법 |
|-------|------|--------|----------|
| 1 | Shell 통합 + 데이터 기반 | P1 | 수동 + 통합 테스트 |
| 2 | PR 트래킹 | P1 | 수동 + API 통합 테스트 |
| 3 | Naia 기본 통합 | P1 | 수동 E2E |
| 4 | 행동 기반 우선순위 | P2 | 자동화 + 수동 |
| 5 | 개인 워크플로우 | P2 | 단위 + 수동 E2E |
| 6 | 유저 피드백 + 커뮤니티 | P2 | 수동 + API 통합 |
| 7 | 고급 기능 | P3 | 수동 E2E |

---

## 9. 테스트 계획

### 9.1 테스트 전략

```
단위 테스트 (Vitest)
  └─ 순수 로직: API 응답 파싱, 점수 계산, 우선순위 정렬
통합 테스트 (Vitest + 실제 API)
  └─ GitHub GraphQL, Gitea REST, IndexedDB CRUD
E2E 테스트 (Playwright + Tauri webdriver)
  └─ 실제 앱 실행 후 UI 인터랙션
수동 검증
  └─ Naia 대화 흐름 (LLM 출력 자동화 어려움)
```

**원칙**: 테스트 코드 자체도 반복 리뷰 (연속 2회 클린 패스 후 실행)

---

### 9.2 Phase별 테스트 계획

#### Phase 1 테스트

**단위 테스트** (`shell/src/__tests__/github-client.test.ts`)
```
- parseIssueResponse(): GraphQL 응답 → Issue 객체 변환
- buildBatchQuery(): 레포 목록 → GraphQL 쿼리 생성
- handleRateLimit(): X-RateLimit-Remaining 헤더 파싱
- mergeIssues(): 복수 레포 결과 병합 + 중복 제거
```

**통합 테스트** (`shell/src/__tests__/github-integration.test.ts`)
```
환경변수: GITHUB_PAT (test용 read-only token)
- fetchIssues(repos): 실제 nextain/naia-os 이슈 최소 1개 반환
- cacheIssues() → getCachedIssues(): IndexedDB round-trip
- fetchIssues() 오프라인 → 캐시 반환 (네트워크 mock)
```

**수동 검증**
```
[ ] 패널이 ModeBar에 "Work" 탭으로 등록됨
[ ] 3개 이상 레포 이슈가 목록에 표시됨
[ ] 레포 필터 동작
[ ] 네트워크 차단 후 캐시 데이터 표시 + "N분 전" 표시
```

---

#### Phase 2 테스트

**단위 테스트** (`shell/src/__tests__/gitea-client.test.ts`)
```
- parseGiteaPR(): Gitea API 응답 → PR 객체 변환
- detectSilentPR(pr, thresholdDays): N일 초과 여부 판단
- mergeAllPRs(githubPRs, giteaPRs): 통합 PR 목록 생성
```

**통합 테스트**
```
환경변수: CODEBERG_PAT
- fetchCodebergPR('luke-n-alpha', 'whisper-rs', 275): 실제 PR 상태 반환
- fetchMyGithubPRs(): nextain/* 레포에서 내 PR 최소 1개
```

**수동 검증**
```
[ ] PR 뷰에서 내 GitHub PR 표시
[ ] whisper-rs Codeberg PR #275 상태 표시
[ ] 5일 이상 응답 없는 PR에 ⚠ 배지
[ ] 머지된 PR은 "머지됨" 배지 + 회색 처리
```

---

#### Phase 3 테스트

**단위 테스트** (`shell/src/__tests__/worktree.test.ts`)
```
- parseWorktreeList(output): git worktree list 출력 파싱
- extractIssueNumber(branch): 'issue-91-work-intel' → 91
- buildBriefingContext(issues, prs, progress): Naia 입력 구성
```

**수동 E2E 검증**
```
[ ] 앱 첫 실행 시 아침 브리핑 표시 (Naia 채팅에 메시지)
[ ] 같은 날 두 번째 열 때 브리핑 없음 (중복 방지)
[ ] 이슈 클릭 시 progress.json 있으면 재개 브리핑
[ ] progress.json 없으면 마지막 GitHub 코멘트 기반 브리핑
[ ] "뭐부터 해야 해?" → 3개 추천 + 근거
[ ] "91번 시작해줘" → 기존 워크트리 있으면 확인 모달
[ ] 워크트리 없으면 자동 생성
```

---

#### Phase 4 테스트

**단위 테스트** (`shell/src/__tests__/behavior.test.ts`)
```
- calcAttentionScore(logs): 열람 횟수 × 체류 시간 가중 점수
- detectPriorityGap(issue, logs, threshold): 갭 감지 로직
- aggregateByRepo(logs): 레포별 집중 비율 계산
- weeklyRollup(logs, weekStart): 주간 집계
```

**수동 검증**
```
[ ] 이슈 5회 클릭 후 behavior_log에 5개 기록 확인 (DevTools)
[ ] P3 이슈 10회 열람 후 ⚠ 갭 배지 표시
[ ] "내 관심 뷰" 전환 시 열람 많은 이슈 상위
[ ] opt-out 설정 시 behavior_log 기록 안 됨
[ ] "뭐부터?" 답변에 행동 신호 반영됨 ("이번 주 5회 조회" 언급)
```

---

#### Phase 5 테스트

**단위 테스트** (`shell/src/__tests__/workflow.test.ts`)
```
- calcRiceScore(reach, impact, confidence, effort): 공식 검증
- countWipIssues(issues): build 단계 이상 이슈 집계
- isWipExceeded(issues, limit): 한도 초과 판단
- classifyTriage(issue, bucket): Now/Next/Someday 분류 저장/조회
```

**수동 E2E 검증**
```
[ ] N 키 단축키 → 캡처 팝업 열림
[ ] 캡처 텍스트 입력 후 Enter → 인박스 저장
[ ] 진행 중 이슈 3개 + 4번째 시작 시도 → 경고 모달
[ ] RICE 슬라이더 조정 → 점수 실시간 업데이트
[ ] Now/Next/Someday 드래그 후 새로고침 → 분류 유지
```

---

#### Phase 6 테스트

**단위 테스트**
```
- calcReactionScore(reactions): 👍 우선 가중치 계산
- detectFeedbackGap(label, reactionCount): 피드백 갭 임계값
- buildCommunityPrompt(profile, comment): 커뮤니티 톤 프롬프트 구성
- classifyNotification(notification): 내 액션 / FYI 분류
```

**수동 검증**
```
[ ] 이슈 카드에 reactions 수 표시
[ ] reactions 높은 P3 이슈에 갭 배지 + "뭐부터?" 반영
[ ] vllm PR 코멘트 클릭 → RFC 스타일 초안 생성 + AI disclosure 포함
[ ] whisper-rs PR 코멘트 → 캐주얼 스타일 초안
[ ] 알림 목록 "내 액션" / "FYI" 분리 표시
[ ] Discord 섹션 "연결 안 됨" graceful 표시
```

---

#### Phase 7 테스트

**단위 테스트**
```
- calcAvgDuration(closedIssues, labelFilter): 라벨 기준 평균 소요 시간
- findSimilarIssues(issue, closed): 유사 이슈 매칭 (라벨 기반)
- appendLessonsLearned(entry, yamlPath): YAML append 정확성
```

**수동 E2E 검증**
```
[ ] 이슈 닫기 클릭 → 체크리스트 모달 표시
[ ] lessons-learned 입력 → .agents/context/lessons-learned.yaml에 항목 추가됨
[ ] 비슷한 라벨 이슈 3개 닫힌 후 → "평균 N일 소요" 표시
[ ] 이슈 탭 닫을 때 "진행 상황 기록할까요?" 제안
[ ] 크로스레포 의존성 설정 후 이슈 시작 → 영향 레포 경고
```

---

### 9.3 테스트 환경 설정

```bash
# 테스트용 환경변수 (.env.test)
GITHUB_PAT=ghp_xxx          # read-only, nextain/* 레포 접근
CODEBERG_PAT=xxx            # read-only
TEST_REPO=nextain/naia-os   # 기본 테스트 레포

# E2E 실행 (실제 앱, Gateway + API 키 필요)
cd shell && pnpm run test:e2e:tauri -- issue-desk

# 단위 + 통합 테스트
cd shell && pnpm test -- --testPathPattern issue-desk
```

### 9.4 테스트 불가 영역 (수동 전용)

| 항목 | 이유 | 검증 방법 |
|------|------|---------|
| Naia 대화 품질 | LLM 출력 비결정적 | 시나리오별 수동 실행 + 출력 품질 주관 평가 |
| 커뮤니티 톤 매칭 | 커뮤니티별 정의 모호 | 각 커뮤니티 코멘트 예시로 수동 비교 |
| 아침 브리핑 유용성 | 내용 품질 주관적 | Luke 직접 사용 후 피드백 |
| RICE 점수 적절성 | 도메인 판단 | Luke 직접 조정 + 결과 비교 |

---

*이 문서는 설계 초안입니다. 구현 전 검토 및 수정이 필요합니다.*
