<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Upstream OSS 기여 워크플로우

> SoT: `.agents/context/upstream-contribution.yaml`

외부 OSS 프로젝트를 포크하고, 리서치하고, 컨텍스트를 주입하고, upstream에 기여하는 방법. 외부 프로젝트 포크에서 작업할 때 적용된다.

**케이스 히스토리**: whisper-rs (#63), vLLM (#73) — 둘 다 Landscape 조사 생략으로 실패.

---

## 활용 유형 분류

| 유형 | 설명 | 언제 |
|------|------|------|
| **use-as-is** | upstream 라이브러리 직접 사용 — 포크 없음 | 기능이 upstream에 이미 존재 |
| **fork-internal** | 내부 사용 목적 포크 — 기여 계획 없음 | 큰 divergence 필요하거나 upstream이 받지 않을 것 |
| **upstream-contribution** | 기여 목적 포크 | 수정/기능이 upstream에 속함 |

> **참고**: 기여 포기도 올바른 결론 — PR을 억지로 올리지 않아도 된다.

---

## Landscape 조사 (구현 전 반드시 수행)

**원칙**: 코드를 한 줄도 쓰기 전에 upstream이 이 문제를 어떻게 보는지 파악한다.

| 항목 | 질문 | 조사 위치 | 컨텍스트 파일 |
|------|------|-----------|--------------|
| Scope / 레이어 판단 | 이 문제가 이 프로젝트 scope인가? | README, 아키텍처 문서 | `agents-rules.json` |
| AI 정책 | Type A(금지) / B(조건부) / C(허용)? | CONTRIBUTING.md, 이슈 토론 | `agents-rules.json` |
| RFC 히스토리 | 이미 논의/결정된 사항인가? | RFC 레이블 이슈, wontfix 닫힌 PR | `feature-design.yaml` |
| Sub-project | 이 영역을 담당하는 관련 서브 프로젝트가 있는가? | GitHub org, ROADMAP.md | `feature-design.yaml` |
| 진행 중 PR | 이미 누군가 구현 중인가? | 오픈 PR, 연결된 이슈 | `feature-design.yaml` |
| 메인테이너 stance | 메인테이너의 입장은? | 이슈 코멘트, Discussions | `feature-design.yaml` |
| 코딩 컨벤션 (실측) | 코드베이스가 실제로 사용하는 패턴은? | 소스 파일 직접 읽기 | `coding-conventions.yaml` |
| 기여 요건 | CONTRIBUTING.md가 실제로 요구하는 것은? | CONTRIBUTING.md, CI 설정, PR 템플릿 | `contributing-guide.yaml` |
| 커뮤니티 말투 | 이 커뮤니티는 어떻게 소통하는가? | 이슈/PR 토론 스레드 | `contributing-guide.yaml` |

> **AI 정책이 Type A이면 즉시 중단. 구현하지 않고, 이슈도 열지 않는다.**

> **vLLM #73 교훈**: 오디오 출력은 vllm main에서 명시적으로 scope out됨 (RFC #16052). vllm-omni가 올바른 타겟. 전체 구현 후에야 발견.

---

## Fork 컨텍스트 주입

**원칙**: fork `.agents/`에 upstream 규칙을 채워서 AI 세션이 처음부터 올바른 컨텍스트를 갖도록 한다.

### 브랜치 정책

| 브랜치 | 내용 | 규칙 |
|--------|------|------|
| `main` | upstream HEAD + `.agents/` 컨텍스트 | AI 설정만 — 코드 변경 없음 |
| `feature/*` | 코드 변경만 | `.agents/`는 upstream PR diff에 포함 금지 |

> **upstream PR에 `.agents/`를 절대 포함하지 않는다** — 이것은 개인 AI 설정이다.

### 필수 컨텍스트 파일

| 파일 | 목적 | 내용 출처 |
|------|------|----------|
| `.agents/context/agents-rules.json` | Scope, AI 정책, 컨벤션, 기여 요건 | CONTRIBUTING.md + 실제 코드 패턴 |
| `.agents/context/feature-design.yaml` | RFC 히스토리, 서브 프로젝트, 진행 중 PR | GitHub Issues/Discussions, ROADMAP.md |
| `.agents/context/coding-conventions.yaml` | 실제 네이밍, 포매팅, 패턴 | 소스 파일 읽기, .editorconfig, 린터 설정 |
| `.agents/context/contributing-guide.yaml` | 테스트 요건, PR 프로세스, sign-off, CLA | CONTRIBUTING.md, CI 설정, PR 템플릿 |

### 하네스 설정

- **fork** `.claude/hooks/`에 하네스 설치 — naia-os 훅이 아님
- 훅 작성 시: naia-os `.claude/hooks/`를 참조 구현으로 먼저 읽기
- `PreToolUse` → 블로킹 (해로운 행동 전 중단)
- `PostToolUse` → advisory (행동 후 경고)
- `Stop` → 리뷰 강제 (거짓 클린 패스 선언 차단)
- **하네스 한계**: 하네스는 스타일과 프로세스만 잡는다 — 설계 판단은 사람이 한다

---

## Upstream 이슈 먼저

**원칙**: 구현 코드를 쓰기 전에 **upstream 레포**에 이슈를 개설한다.

### 응답 대기 중

| 허용 | 금지 |
|------|------|
| `.agents/` 컨텍스트 파일 구축 | 구현 코드 작성 |
| 하네스 훅 설정 | upstream 이슈 참조 없이 PR 개설 |
| upstream 코드 읽기 및 이해 | |
| 테스트 작성 (구현 없음) | |

**무응답 정책**: 2주 후 응답 없으면 → PR-1 진행 (인터페이스만, 최소 footprint).

**Progress 파일**: `.agents/progress/*.json`에 `upstream_issue_ref: "owner/repo#N"` 기록.

---

## 구현 원칙

- 모든 라인은 human-defensible — 설명할 수 없으면 쓰지 않는다
- AI slop 시그널 회피: 장식적 주석, 추측 코드, 과도한 설계
- upstream 코드를 먼저 읽는다 — 패턴을 추측하지 않는다
- 추측 금지: 동작이 불명확하면 실제 구현을 읽는다
- 최소 footprint: upstream 코드를 가능한 최소한만 변경한다

---

## PR 준비 기준

- [ ] Upstream CI 체크 통과 (naia-os 아닌 upstream의 체크)
- [ ] 중복 없음: 동일한 내용의 PR/이슈가 없음을 확인
- [ ] 모든 라인 human-defensible (AI slop 없음)
- [ ] AI 기여 명시 (`Assisted-by:` trailer)
- [ ] `upstream_issue_ref` progress 파일에 기록
- [ ] `.agents/` 파일이 PR diff에서 제외됨

---

## Anti-Pattern (케이스 히스토리)

| 패턴 | 케이스 | 결과 | 규칙 |
|------|--------|------|------|
| 바로 포크하고 코딩 | vLLM #73 | 전체 구현 후 vllm-omni (올바른 타겟) 발견 | Landscape 조사 후 코딩 |
| RFC 히스토리 확인 생략 | vLLM #73 | 오디오 출력이 vllm main scope out (RFC #16052) | Issues에서 RFC/wontfix/scope-out 먼저 검색 |
| upstream 이슈 없이 코딩 | vLLM #73 | 메인테이너 실제 계획과 구현 불일치 | upstream 이슈 열고 신호 받은 후 구현 |
| naia-os 하네스 통과 = upstream 품질 착각 | vLLM #73 | naia-os 하네스 통과 ≠ upstream 수용 | Upstream CI + CONTRIBUTING.md가 품질 기준 |
| AI 정책 무시 | whisper-rs #63 | 프로젝트의 AI 생성 코드 정책 위반 | 작업 전 AI 정책 확인 (Type A/B/C) |
