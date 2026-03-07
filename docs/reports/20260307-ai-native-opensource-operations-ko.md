<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# AI 네이티브 오픈소스 운영 모델 — 설계 보고서

- **이슈**: naia-os#9
- **작성일**: 2026-03-07
- **상태**: 최종 (v2, 구현 결과 및 회고 포함)

---

## 1. 배경: 오픈소스의 Eternal September

### 1.1 무엇이 변했나

2025-2026년, 오픈소스 생태계는 전례 없는 위기에 직면했다. AI 코딩 도구가 코드 작성의 장벽을 없앴지만, 코드 **리뷰**의 비용은 변하지 않았다.

GitHub은 이를 **"오픈소스의 Eternal September"**이라 부른다 — 1993년 AOL이 Usenet 접근을 개방하면서 매년 9월에만 몰리던 신규 사용자가 연중 상시로 바뀐 사건에서 유래한 표현이다. 같은 일이 지금 오픈소스에서 벌어지고 있다: AI가 모든 사람에게 코드 생성 능력을 부여했다.

### 1.2 주요 사건

| 프로젝트 | 대응 | 이유 |
|---------|------|------|
| **curl** | 버그 바운티 중단 | 제출물의 20%가 AI 생성 쓰레기 |
| **Ghostty** | AI 기여 무관용 | 승인된 이슈에서만 AI 기여 허용 |
| **tldraw** | 외부 PR 전면 차단 | 메인테이너 리뷰 부담 감당 불가 |

### 1.3 학술적 근거: "바이브 코딩이 오픈소스를 죽인다"

arXiv 논문 [2601.15494]의 주요 발견:

- **Tailwind CSS**: npm 다운로드는 계속 증가했지만, 문서 트래픽은 ~40% 감소, 매출은 ~80% 감소
- **Stack Overflow**: ChatGPT 출시 6개월 만에 활동량 ~25% 하락
- **메커니즘**: 바이브 코딩은 OSS를 "사용"하지만 문서를 읽거나, 버그를 보고하거나, 커뮤니티에 참여하지 않음
- **결론**: OSS를 지속하려면, 바이브 코딩 사용자들이 직접 사용자 기여분의 최소 84%를 대체해야 함

### 1.4 업계 대응: 방어 vs 수용

**AI에 대한 방어**:
- Vouch (Mitchell Hashimoto) — 명시적 신뢰 관리, 보증(vouching) 시스템
- PR Kill Switch — 일부 저장소에서 PR 자체를 비활성화
- AI 사용 의무 공개 + 거부 정책

**AI와 함께 설계**:
- GitHub Agentic Workflows — Markdown 기반 AI 자동화
- AGENTS.md 표준 (OpenAI, Linux Foundation AAIF) — 60,000개 이상 프로젝트 채택
- Responsible Vibe Coding Manifesto — 작고 집중된 PR, AI 사용 표기, 인간 책임

**양쪽이 동의하는 점**: AI 자체가 문제가 아니라 — **AI를 잘못 사용하는 것**이 문제다. Ghostty도 AI로 만들어졌고, Daniel Stenberg도 AI를 사용한다.

---

## 2. Naia OS의 입장: AI 네이티브 오픈소스

### 2.1 우리가 다른 점

| 관점 | 기존 오픈소스 | Naia OS |
|------|-------------|---------|
| AI 입장 | AI 기여를 **방어** | AI 기여를 워크플로우에 **설계** |
| 기여 가정 | 기여자가 직접 코드를 읽고 작성 | 기여자가 AI **와 함께** 읽고 작성 |
| 온보딩 | README → CONTRIBUTING.md 읽기 | Clone → AI가 프로젝트 설명 → 언어 장벽 없음 |
| 컨텍스트 | 사람이 읽는 문서만 | `.agents/` (AI용) + `.users/` (사람용) 이중 구조 |
| 언어 | 영어 필수 | 모든 언어 환영; AI가 영어로 번역 |
| 신뢰 | 코드 품질로 판단 | 코드 + 컨텍스트 품질로 판단 |

### 2.2 다섯 가지 전제

1. **최소 환경**: AI 코딩 도구 + Git 통합
2. **양방향 AI**: 기여자와 메인테이너 모두 AI 사용
3. **영어 공용어**: Git의 공개 공유는 영어; 개인 작업 로그는 모국어; AI가 번역
4. **혼합된 숙련도**: 초보자부터 전문가까지; AI가 수준에 맞게 안내
5. **커뮤니케이션 흐름**: 사람 → AI → Git (영어) → AI → 사람

### 2.3 철학적 기반

charter-draft.yaml의 핵심 질문:
> **"협업이 혼자 일하는 것보다 효율적이라는 것을 AI에게 가르칠 수 있을까?"**

Naia OS의 답:
- 코드는 더 이상 커뮤니티를 하나로 묶는 접착제가 아니다 — AI가 그 역할을 대체했다
- **컨텍스트**가 새로운 오픈소스 인프라다 (철학, 아키텍처 결정, 기여 규칙, 워크플로우)
- 더 좋은 공유 컨텍스트 = 모든 사람의 AI가 더 효율적으로 작동

---

## 3. 운영 모델 설계

### 3.1 기여 유형 (10가지)

기여 페이지의 7가지에 3가지 추가:

| # | 유형 | 설명 | 난이도 |
|---|------|------|--------|
| 1 | **번역** | `.users/context/{lang}/` 추가, i18n 사전 항목 | 낮음 |
| 2 | **스킬** | `agent/assets/default-skills/`에 AI 스킬 생성 | 중간 |
| 3 | **신기능** | 새 기능 제안 또는 구현 | 높음 |
| 4 | **버그 리포트** | 버그 발견 → 이슈 제출 | 낮음 |
| 5 | **코드/PR** | 이슈 선택 → PR 제출 | 중상 |
| 6 | **문서** | `.users/context/` 문서 개선 | 낮음-중간 |
| 7 | **테스팅** | 앱 사용 후 피드백 공유 | 낮음 |
| 8 | **디자인/UX/에셋** | UI/UX 개선, 목업, 아이콘, VRM 아바타 모델 | 중간 |
| 9 | **보안 리포트** | 취약점 발견 → GitHub Security Advisory로 보고 | 중상 |
| 10 | **컨텍스트 기여** | `.agents/` 컨텍스트 파일 개선 (코드와 동등한 가치) | 중간 |

> **왜 10가지인가?** Naia OS는 아바타 중심(philosophy.yaml `avatar_centric`)이므로 VRM/3D 에셋 기여는 코드만큼 중요하다. 컨텍스트 기여(#10)는 핵심 통찰에서 비롯된다: "좋은 `.agents/` 파일 하나가 AI slop PR 100개를 막는다."

### 3.2 기여자 흐름

```
[기여자] ─── 모국어 의도 ───→ [AI 코딩 도구]
                                       │
                                Clone repo & .agents/ 읽기
                                       │
                                AI가 프로젝트 설명 (모국어)
                                       │
                                기여 유형 추천
                                       │
                                ┌──────┴──────┐
                                ▼              ▼
                          코드 기여      비코드 기여
                                │              │
                          AI가 코딩      AI가 문서/번역
                          지원           지원
                                │              │
                          AI가 영어      AI가 영어
                          커밋 작성      문서 작성
                                │              │
                                └──────┬──────┘
                                       │
                                PR/Issue 제출 (영어)
                                + AI 사용 표기
                                + Assisted-by trailer
                                       │
                                [GitHub — 영어 기록]
```

#### 3.2.1 온보딩 (모든 기여 유형 공통)

1. **Clone**: `git clone https://github.com/nextain/naia-os.git`
2. **AI 도구로 열기**: Claude Code, Cursor, Windsurf, OpenCode, Gemini 등
3. **모국어로 질문**: "이 프로젝트가 뭐고 어떻게 도울 수 있나요?"
4. **AI가 `.agents/`를 읽고 안내**: 비전, 아키텍처, 로드맵, 기여 가능 영역
5. **기여 유형 선택**: AI가 기여자의 숙련도와 관심사에 따라 추천

#### 3.2.2 코드 기여 프로세스

```
1. 이슈 확인 (기존 선택 또는 새로 생성)
   └─ AI가 중복 확인, 기존 이슈 검색

2. 브랜치 생성
   └─ issue-{number}-{short-description}

3. 코드 작성 (AI 지원)
   └─ AI가 기존 패턴, 코딩 컨벤션, 테스트 가이드라인 안내
   └─ contributing.yaml 코드 규칙 준수

4. 셀프 리뷰 (AI 지원)
   └─ AI가 contributing.yaml 체크리스트 기준으로 리뷰
   └─ Lint, 타입 체크, 테스트 실행

5. PR 제출
   └─ 영어 제목 (type(scope): description)
   └─ 본문은 모국어 OK (AI가 번역)
   └─ AI 사용 표기 필수 (Assisted-by trailer)
   └─ 작고 집중된 PR (20개 파일 이하 권장)

6. CI 자동 검증
   └─ Lint, 타입 체크, 테스트
   └─ 라이선스 헤더 확인
   └─ 컨텍스트 미러 동기화 확인
```

#### 3.2.3 비코드 기여 프로세스

**번역**:
```
1. .users/context/에서 영문 문서 선택
2. .users/context/{lang}/ 디렉터리 생성
3. AI 지원으로 번역 (기술 용어 유지)
4. PR 제출 → CI가 영문 원본과의 구조 동기화 확인
```

**버그 리포트**:
```
1. AI에게 모국어로 문제 설명
2. AI가 기존 이슈에서 중복 검색
3. AI가 영어 이슈 템플릿 작성 지원
4. 이슈 제출
```

**컨텍스트 기여**:
```
1. .agents/ YAML/JSON 파일 개선
2. .users/context/ (영어)와 .users/context/ko/ (한국어)에 변경 미러링
3. SPDX 라이선스 헤더 확인 (CC-BY-SA-4.0)
4. PR 제출 → CI가 삼중 미러 동기화 확인
```

### 3.3 메인테이너 흐름

```
[GitHub — 영어 기록] ──→ [메인테이너의 AI] ──→ [메인테이너 (Luke)]
                                │                       │
                          AI가 이슈/PR            모국어로 판단
                          분류                    (한국어)
                          AI가 리뷰 지원          승인/수정 요청/거절
                          AI가 번역
                                │                       │
                                ▼                       ▼
                          자동화 (CI/Bot)          인간 판단 (품질/방향)
```

#### 3.3.1 이슈 분류(Triage)

```
1. 이슈 제출 (기여자)
   │
2. 자동 라벨링 (GitHub Agentic Workflow)
   ├─ 유형: bug / feature / question / translation / skill / docs / security
   ├─ 우선순위: P0-critical / P1-high / P2-medium / P3-low
   ├─ 컴포넌트: shell / agent / gateway / os / context
   └─ 중복 확인: 유사 이슈 자동 링크
   │
3. 메인테이너 확인
   ├─ 유효한 이슈: 라벨 확인 + 담당자 지정
   ├─ 정보 필요: 상세 요청 (AI가 기여자 언어로 질문 생성)
   └─ AI slop: 정중하게 거절 + 기여 문서 안내
```

#### 3.3.2 PR 리뷰

```
1. PR 제출 (기여자)
   │
2. CI 자동 검증 (Gate 1)
   ├─ 빌드 성공
   ├─ 테스트 통과
   ├─ Lint/포맷 통과
   ├─ 라이선스 헤더 존재
   └─ AI 사용 표기 확인
   │
3. AI 리뷰 보조 (Gate 2)
   ├─ PR Agent / CodeRabbit 자동 리뷰
   ├─ 변경 범위 요약
   ├─ 잠재적 문제 플래그
   └─ 컨텍스트 미러 동기화 상태
   │
4. 메인테이너 리뷰 (최종 gate)
   ├─ 코드 품질
   ├─ 아키텍처 적합성
   ├─ 컨벤션 준수
   └─ 승인 / 수정 요청 / 거절
       │
       ├─ 수정 요청: AI가 피드백을 기여자 언어로 번역
       └─ 승인: squash merge + 릴리스 노트
```

#### 3.3.3 AI Slop 방어 전략

Naia OS는 게이트키핑 대신 **"구조가 품질을 보장한다"**는 접근을 선택했다:

| 레이어 | 메커니즘 | 목적 |
|--------|---------|------|
| **L1: 컨텍스트** | `.agents/` 디렉터리 | AI가 코드 생성 전 프로젝트를 이해 |
| **L2: 자동화** | CI gates (빌드, 테스트, lint) | 기본 품질 강제 |
| **L3: AI 리뷰** | PR Agent 자동 리뷰 | 패턴 위반, 보안 문제 탐지 |
| **L4: 인간 판단** | 메인테이너 최종 리뷰 | 아키텍처와 방향 결정 |
| **L5: 에스컬레이션** | Vouch 시스템 (커뮤니티 성장 시) | 반복적 저품질 기여자 관리 |

핵심 원칙: **L1-L3이 충분히 강하면, L4의 부담이 줄어든다.** `.agents/` 컨텍스트가 풍부할수록 AI 지원 기여의 품질이 높아진다.

### 3.4 커뮤니케이션 구조

#### 3.4.1 언어 흐름

```
기여자 (일본어) → AI → Issue/PR (영어) → AI → 메인테이너 (한국어)
메인테이너 (한국어) → AI → 리뷰 코멘트 (영어) → AI → 기여자 (일본어)
```

- Git에 기록되는 모든 것: **영어**
- 이슈/PR 제출: 모국어 허용 (AI가 메인테이너를 위해 번역)
- 개발 산출물(발견, 계획, 결정)을 Issue 코멘트로 공유: **영어**
- 코드 주석, 커밋 메시지, 컨텍스트 파일: **영어 필수**
- 작업 로그, 개인 메모: **기여자가 선호하는 언어**
- AI 응답: 기여자가 선호하는 언어

#### 3.4.2 커뮤니케이션 채널

| 채널 | 용도 | 언어 |
|------|------|------|
| GitHub Issues | 버그, 기능 요청, 질문 | 영어 (모국어 허용) |
| GitHub PRs | 코드/문서 리뷰 | 영어 |
| GitHub Discussions | 설계 토론, RFC | 영어 |
| Discord (선택) | 실시간 커뮤니티 | 다국어 (채널별) |

#### 3.4.3 숙련도별 AI 적응

| 수준 | AI의 역할 |
|------|----------|
| **초보자** | 프로젝트 설명, 개발 환경 설정, 시작 이슈 추천 |
| **중급자** | 아키텍처 설명, 관련 코드 안내, 구현 방향 |
| **전문가** | 핵심 로직 설명, 설계 의도, 자율적 기여 지원 |

AI는 `.agents/` 컨텍스트를 읽고 기여자의 질문 수준에 맞춰 응답을 조절한다. 모든 수준에 같은 컨텍스트 → 일관된 프로젝트 이해.

---

## 4. 인프라 갭 분석

### 4.1 현재 상태 vs 필요 사항

| 인프라 | 현재 | 필요 | 우선순위 |
|--------|------|------|---------|
| `.agents/context/contributing.yaml` | 존재 (코드 중심) | 10가지 기여 유형 프로세스 | P1 |
| `.agents/context/open-source-operations.yaml` | 미존재 | 전체 운영 모델 | P1 |
| GitHub Issue 템플릿 | bug_report.yml만 | 기여 유형별 6개 템플릿 | P1 |
| GitHub PR 템플릿 | 최소 (3줄) | AI 공개 + 체크리스트 | P1 |
| CI 파이프라인 | 미존재 | 빌드/테스트/lint + 라이선스 확인 | P1 |
| GitHub Agentic Workflow | 미존재 | 이슈 분류 자동화 | P2 |
| AI PR 리뷰 | 미존재 | CodeRabbit 또는 PR Agent | P2 |
| `.github/DISCUSSION_TEMPLATE/` | 미존재 | RFC, 질문 템플릿 | P3 |
| Vouch 통합 | 미존재 | 커뮤니티 성장 시 | P3 |
| `CONTRIBUTING.md` | 존재 (최소) | 10가지 유형 커버로 확장 | P2 |

### 4.2 GitHub Issue 템플릿 (신규)

현재 `bug_report.yml`만 존재. 추가 필요:

1. **feature_request.yml** — 신기능 제안
2. **translation.yml** — 번역 기여
3. **skill_proposal.yml** — AI 스킬 제안
4. **docs_improvement.yml** — 문서 개선
5. **context_contribution.yml** — `.agents/` 컨텍스트 개선 제안

**보안 리포트**: 커스텀 템플릿 대신 GitHub Security Advisories (GHSA) 사용. 저장소 Settings → Security → Private vulnerability reporting에서 활성화.

모든 템플릿에 포함할 내용:
- "모든 언어를 환영합니다" 안내
- AI 도구 사용 체크박스
- 관련 `.agents/` 컨텍스트 파일 참조

### 4.3 GitHub PR 템플릿 (확장)

현재:
```markdown
## What changed?
**Any language is welcome.**
```

필요:
```markdown
## What changed?
<!-- 이슈를 #number로 참조 -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Translation
- [ ] Documentation
- [ ] Context (.agents/) update
- [ ] Skill

## AI disclosure
- [ ] AI-assisted (아래에 도구 명시)
- [ ] Fully AI-generated
- [ ] No AI used

AI tool(s) used: <!-- 예: Claude Code, Cursor, Copilot -->

## Checklist
- [ ] 테스트 포함 (새 코드는 새 테스트 필요)
- [ ] 테스트 통과 (`pnpm test`)
- [ ] 앱 실제 실행 확인 (VERIFY 단계)
- [ ] 컨텍스트 파일 업데이트 필요 시 완료 (.agents/ + .users/)
- [ ] 새 파일에 라이선스 헤더 존재
- [ ] 커밋 메시지 영어
- [ ] AI 사용 표기 포함 (`Assisted-by:` trailer)

**설명은 모든 언어를 환영합니다.**
```

### 4.4 CI 파이프라인

```yaml
# 필수 GitHub Actions
1. build-test.yml
   - pnpm install → build → test
   - Rust cargo test

2. lint-format.yml
   - Biome lint + format check

3. license-check.yml
   - .agents/ 파일: SPDX-License-Identifier 확인
   - .users/ 파일: HTML 라이선스 주석 확인

4. context-mirror-check.yml
   - .agents/ ↔ .users/context/ ↔ .users/context/ko/ 동기화 확인
   - 섹션 수, 헤더 구조 비교

5. ai-attribution-check.yml (선택)
   - PR에서 AI 공개 체크박스 확인
   - 커밋에서 Assisted-by trailer 확인 (경고만, 차단하지 않음)
```

### 4.5 GitHub Agentic Workflow (P2)

```markdown
---
name: Issue Triage
on:
  issues:
    types: [opened]
permissions:
  issues: write
agent: copilot
---

이슈 제목과 본문을 읽으세요.
유형별로 분류: bug, feature, question, translation, skill, docs, security.
적절한 라벨을 추가하세요.
유사한 열린 이슈를 확인하고 발견되면 링크하세요.
이슈에 재현 단계가 없으면(버그의 경우),
상세 정보를 요청하는 코멘트를 추가하세요.
모든 응답은 정중하게 — 모든 언어를 환영합니다.
```

---

## 5. AI 사용 표기 정책

### 5.1 원칙

- AI 사용은 환영; **투명성**이 필수
- AI 생성 코드의 **책임**은 기여자에게 있음
- 사용 표기는 **추천사항** — 차단하지 않음

### 5.2 Git Trailers

```
feat(agent): add weather skill

Implement weather query skill using OpenWeatherMap API.
Includes rate limiting and error handling.

Assisted-by: Claude Code
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### 5.3 PR 설명

AI 도구 사용은 PR 본문의 체크박스로 표시. 강제하지만 리뷰어는 확인만 — 공개 누락 시 자동 차단하지 않음.

---

## 6. 컨텍스트 중심 품질 전략

### 6.1 핵심 통찰

> `.agents/` 컨텍스트 품질이 올라가면, AI 기여자의 코드 품질도 올라간다.

이것이 Naia OS가 Vouch나 PR Kill Switch 대신 이 전략을 선택한 이유다. AI가 코드 생성 전 프로젝트를 **잘 이해**하면, "AI slop"이 생성될 확률이 줄어든다.

### 6.2 컨텍스트 투자 우선순위

| 우선순위 | 컨텍스트 | 효과 |
|---------|---------|------|
| P0 | `agents-rules.json` (SoT) | 모든 AI 에이전트의 기본 행동 정의 |
| P0 | `contributing.yaml` | 기여 프로세스 안내 |
| P0 | `architecture.yaml` | 코드 구조 이해 |
| P1 | `philosophy.yaml` | 프로젝트 방향 |
| P1 | `testing.yaml` | 테스트 가이드 |
| P2 | 기여 유형별 워크플로우 | 구체적 프로세스 |

### 6.3 컨텍스트 기여의 가치

코드 기여와 컨텍스트 기여는 **동등**하게 취급한다. 이유: 좋은 컨텍스트 파일 하나가 AI slop PR 100개를 막는다.

---

## 7. 리스크와 대응

### 7.1 식별된 리스크

| 리스크 | 가능성 | 영향 | 대응 |
|--------|-------|------|------|
| AI slop 홍수 | 높음 | 높음 | L1-L4 계층적 방어 + 컨텍스트 품질 투자 |
| 보안 취약점 삽입 | 중간 | 높음 | CI 보안 스캔 + 메인테이너 리뷰 |
| 라이선스 위반 | 중간 | 높음 | CI 라이선스 확인 + AI 보호 규칙 |
| 메인테이너 번아웃 (솔로) | 높음 | 치명적 | 자동화 극대화 + AI 리뷰 보조 |
| 컨텍스트 오염 | 낮음 | 중간 | 삼중 미러 CI 검증 |
| 번역 품질 저하 | 중간 | 낮음 | 원어민 리뷰어 또는 AI 교차 검증 |

### 7.2 메인테이너 번아웃 대응 (치명적)

현재: 메인테이너 1명 (Luke). 이것이 가장 높은 리스크.

**대응 전략**:
1. **자동화 극대화**: CI가 품질 게이트의 80% 처리
2. **AI 리뷰 보조**: PR Agent가 기본 리뷰 처리 → 메인테이너는 판단만
3. **이슈 분류 자동화**: Agentic Workflow가 분류 + 중복 탐지 처리
4. **구조화된 기여**: 템플릿이 정보 품질 보장 → 검증 시간 감소
5. **커뮤니티 리뷰어 육성**: 신뢰할 수 있는 기여자를 리뷰어로 승격

### 7.3 단계별 도입

| 단계 | 조건 | 도입 사항 |
|------|------|----------|
| **Phase 1** (현재) | 기여자 0-5명 | Issue 템플릿 + PR 템플릿 + CI + contributing.yaml 확장 |
| **Phase 2** | 기여자 5-20명 | GitHub Agentic Workflow + AI PR 리뷰 |
| **Phase 3** | 기여자 20-100명 | Vouch 시스템 + 커뮤니티 리뷰어 + RFC 프로세스 |
| **Phase 4** | 기여자 100명 이상 | 구조화된 거버넌스 + 분산 의사결정 |

---

## 8. 실행 항목

### 즉시 (Phase 1 — Issue #9 범위)

- [x] 운영 모델 보고서 (이 문서)
- [x] `.agents/context/open-source-operations.yaml`
- [x] `.users/context/open-source-operations.md` (영문 미러)
- [x] `.users/context/ko/open-source-operations.md` (한국어 미러)
- [x] `contributing.yaml` 확장 (10가지 기여 유형 + AI 사용 표기 + 언어 명확화)
- [x] GitHub Issue 템플릿 추가 (feature_request, translation, skill, docs, context)
- [x] GitHub PR 템플릿 확장 (AI 공개 + 체크리스트)
- [x] AI 네이티브 온보딩 테스트 시나리오 (`.agents/tests/ai-native-onboarding-test.md`) — 16개 테스트로 확장
- [x] 컨텍스트 업데이트 테스트 방법론 (`.agents/tests/context-update-test-methodology.md`) — 구조적 문제 우선, 실패 분석 프로토콜
- [x] Issue-driven development 워크플로우 (`.agents/workflows/issue-driven-development.yaml`) — 10단계, 게이트, 반복 규칙
- [x] 멀티 프로젝트 워크스페이스 가이드 (`.agents/context/multi-project-workspace.yaml`)
- [x] 작업 로그 컨벤션 공식화 (프로젝트 내부, gitignored, {username}/ 하위)
- [x] entry point에 공개/비공개 언어 원칙 명확화
- [x] 헤드리스 AI 행동 테스트 (Codex + Gemini CLI) — 7개 테스트 × 2개 도구
- [x] 전체 삼중 미러 문서 (.agents/ + .users/context/ + .users/context/ko/)
- [ ] CI 파이프라인 구축 (빌드, 테스트, lint, 라이선스) — Issue #12

### 단기 (Phase 2)

- [ ] GitHub Agentic Workflow 설정 (이슈 분류)
- [ ] AI PR 리뷰 도구 도입 (CodeRabbit 또는 PR Agent)
- [ ] CONTRIBUTING.md 확장
- [ ] GitHub Discussions 활성화

### 중기 (Phase 3)

- [ ] Vouch 통합 평가
- [ ] 커뮤니티 리뷰어 프로그램
- [ ] RFC 프로세스
- [ ] 기여자 인정 시스템 (CONTRIBUTORS.md, 리더보드)

---

## 9. 참고 자료

### 외부 자료

1. **GitHub, ["Welcome to the Eternal September of open source"](https://github.blog/open-source/maintainers/welcome-to-the-eternal-september-of-open-source-heres-what-we-plan-to-do-for-maintainers/)** (2026-02)
   — AI 기여 홍수, 메인테이너 번아웃, GitHub의 대응 계획

2. **arXiv [2601.15494], ["Vibe Coding Kills Open Source"](https://arxiv.org/abs/2601.15494)** (2026-01)
   — 바이브 코딩이 OSS 지속가능성에 미치는 정량적 영향

3. **[Responsible Vibe Coding Manifesto](https://vibe-coding-manifesto.com/)**
   — 오픈소스에서의 AI 지원 기여 모범 사례

4. **Mitchell Hashimoto, [Vouch](https://github.com/mitchellh/vouch)**
   — 명시적 신뢰 관리 시스템, Trustdown (.td) 형식

5. **[GitHub Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/)** (기술 프리뷰, 2026-02)
   — Markdown 기반 AI 자동화, 이슈 분류

6. **[AGENTS.md](https://agents.md/)** (Linux Foundation AAIF)
   — AI 코딩 에이전트 안내를 위한 오픈 표준, 60,000개 이상 프로젝트 채택

7. **PullFlow, ["AI Agents in Open Source: Evolving the Contribution Model"](https://pullflow.com/blog/ai-agents-open-source-contribution-model/)**
   — AI 에이전트 온보딩 지원, 인간+AI 협업 모델

8. **Continue Blog, ["We're Losing Open Contribution"](https://blog.continue.dev/were-losing-open-contribution)**
   — 개방형 기여 감소에 대한 분석

### 내부 자료

9. **charter-draft.yaml** — AI 시대 오픈소스 커뮤니티 헌장 초안
10. **philosophy.yaml** — 핵심 철학 (AI 주권, 프라이버시, 투명성)
11. **contributing.yaml** — 현행 기여 가이드

---

## 10. 구현 결과 및 회고

### 10.1 생성된 산출물

| 산출물 | 유형 | 라인 수 |
|--------|------|---------|
| `issue-driven-development.yaml` | 신규 워크플로우 | 273 |
| `multi-project-workspace.yaml` | 신규 컨텍스트 | 90 |
| `contributing.yaml` | 수정 | +17/-13 |
| `agents-rules.json` | 수정 | +6/-6 |
| `open-source-operations.yaml` | 수정 | +4/-4 |
| `project-index.yaml` | 수정 | +11 |
| `ai-native-onboarding-test.md` | 확장 (12→16 tests) | +80 |
| `context-update-test-methodology.md` | 확장 | +46 |
| Entry points (×3) | 수정 | +59/-59 each |
| `.users/` 미러 (×5) | 신규 + 수정 | ~230 total |
| **합계** | 17개 파일 | +783/-154 |

### 10.2 헤드리스 테스트 결과

Codex CLI와 Gemini CLI를 사용하여 업데이트된 컨텍스트를 읽은 후 AI 에이전트가 올바르게 행동하는지 검증.

| 테스트 | 설명 | Codex | Gemini | 비고 |
|--------|------|-------|--------|------|
| 5 | 코드 기여 흐름 | PARTIAL | PARTIAL | entry point에 정보 존재하나 도구가 세부사항 놓침 |
| 10 | 스킬 기여 | PARTIAL | FAIL | 문서화된 기여 흐름 대신 코드를 읽음 |
| 11 | PR 템플릿 인지 | **PASS** | — | 이전 PARTIAL에서 개선 |
| 13 | 산출물 위치 | **PASS** | PARTIAL | 신규 테스트 — Issue 코멘트로 올바르게 안내 |
| 14 | 언어 원칙 | **PASS** | **PASS** | 구조적 수정 후 PARTIAL/FAIL에서 수정됨 (10.3 참조) |
| 15 | 작업 로그 컨벤션 | PARTIAL | **PASS** | 신규 테스트 |
| 16 | 멀티 프로젝트 워크스페이스 | **PASS** | **PASS** | 신규 테스트 |

**전체**: 12개 도구-테스트 쌍 중 7 PASS, 4 PARTIAL, 1 FAIL (58% PASS, 33% PARTIAL, 8% FAIL). Test 11/Gemini는 미실행.

### 10.3 발견되어 수정된 구조적 문제

**Test 14 (언어 원칙)**에서 **문서 모순**이 발견됨:

- Entry point: "이슈, PR, 디스커션은 모국어로 작성 가능"
- `issue-driven-development.yaml`: "Issue comments, PR titles → English"

서로 다른 대상(기여자 제출 vs 개발 프로세스 산출물)을 위한 것이었으나 entry point에서 구분하지 않았다. Codex와 Gemini 모두 부정확하거나 불완전한 답변을 줌.

**수정**: 언어 규칙을 분리:
- **이슈 제출, PR 설명** → 모든 언어 환영 (AI가 번역)
- **개발 산출물** (발견, 계획을 Issue 코멘트로 공유) → 영어
- **작업 로그, 개인 메모** → 기여자가 선호하는 언어

수정 후: Codex와 Gemini 모두 Test 14 통과.

**핵심 통찰**: 헤드리스 AI 테스트는 인간 리뷰가 놓치는 문서 모순을 드러낸다. 두 문서가 서로 다른 대상을 위해 같은 주제를 다룰 때, entry point에서 명시적으로 컨텍스트를 구분해야 한다.

### 10.4 남은 갭 (구조적 문제 아님)

| 테스트 | 갭 | 근본 원인 | 권장 사항 |
|--------|-----|---------|----------|
| 5 | one-PR 규칙, AI 사용 표기 누락 | entry point에 정보 존재하나 도구가 깊이 읽지 않음 | 모니터링; 도구 업데이트로 개선 가능 |
| 10 | 코드 vs 문서 경쟁 | 도구가 `agent/src/skills/built-in/`을 찾아 OpenClaw 기여 흐름 대신 설명 | entry point에 스킬 기여 요약 추가 가능; 낮은 우선순위 |
| 15 (Codex) | gitignored/언어 세부사항 누락 | entry point 프로젝트 구조에 정보 존재 | 경미함; Gemini는 통과 |

이들은 **도구 깊이 문제**이지 구조적 문제가 아니다. 정보는 entry point에 존재하며, 도구가 항상 그곳까지 도달하지 못할 뿐이다.

### 10.5 교훈

| # | 카테고리 | 교훈 |
|---|---------|------|
| 1 | **워크플로우 규율** | 단계 순서를 엄격히 준수: Build → Review → E2E Test → Sync → Commit. 테스트 전 커밋 금지. (위반 사례: 리뷰 후 E2E 테스트 전에 커밋함.) |
| 2 | **문서 모순** | 여러 문서가 서로 다른 대상을 위해 같은 주제를 다룰 때, entry point에서 명시적으로 컨텍스트를 구분해야 한다. 헤드리스 테스트가 인간 리뷰가 놓치는 모순을 포착한다. |
| 3 | **반복 리뷰 깊이** | "연속 2회 클린 패스"는 진짜 꼼꼼한 2회를 의미. 이번 세션의 초기 패스는 너무 얕아서 3, 4번째 반복에서야 문제가 발견됨. |
| 4 | **구조적 문제 우선** | AI 테스트 실패 시, 도구 한계 탓하기 전에 문서-코드 불일치와 깨진 참조를 먼저 확인. Test 14의 실패는 도구 약점이 아니라 문서 모순이었다. |

### 10.6 적용된 프로세스 개선

교훈을 바탕으로 다음과 같은 컨텍스트 보강이 이루어졌다:

1. **커밋 전제조건**: `issue-driven-development.yaml` 커밋 단계에 명시적 `prerequisite: "ALL prior phases must be complete before committing"` 추가
2. **언어 원칙 명확화**: entry point, contributing.yaml, 미러 문서에서 이슈 제출(모든 언어)과 개발 산출물(영어)을 구분
3. **실패 분석 프로토콜**: `context-update-test-methodology.md`에 구조화된 실패 분석 추가 (구조적 → 문서-코드 → 참조 추적 → 정보 아키텍처 → 도구 행동)
4. **반복 규칙 공식화**: "연속 2회 클린 패스"를 모든 루프에 적용 (investigate, plan, review, sync)

---

## 11. 결론

### AI 네이티브 오픈소스를 위한 핵심 통찰

1. **컨텍스트가 새로운 인프라다**: `.agents/` 디렉터리가 충분히 풍부하면, AI 기여자의 코드 품질이 자연스럽게 올라간다. 이것은 Vouch나 PR Kill Switch보다 더 근본적인 해결책이다.

2. **AI는 양쪽에 있다**: 기여자만이 아니라 — 메인테이너도 리뷰와 분류에 AI를 사용한다. 운영 모델은 양방향 AI 사용을 위해 설계되어야 한다.

3. **언어 장벽이 해결되었다**: AI 번역이 "모든 언어 환영"을 실질적으로 달성 가능하게 만든다. 공용어는 영어이지만, 진입 장벽은 모국어다.

4. **단계적 성장이 필수적이다**: 솔로 메인테이너에서 100명 커뮤니티까지, 인프라는 점진적으로 확장되어야 한다. 과잉 투자와 과소 투자 모두 리스크다.

5. **투명성이 신뢰를 만든다**: AI 사용 표기을 강제하되 차단하지 않는 것이 장기적으로 건강한 커뮤니티를 만든다 — 교육적이지, 징벌적이지 않다.

6. **헤드리스 테스트가 컨텍스트 품질을 검증한다**: 새 세션에서 AI CLI 도구를 저장소에 대해 실행하면, 인간 리뷰가 포착할 수 없는 문서 모순과 구조적 갭이 드러난다. 이것은 AI 네이티브 통합 테스트에 해당한다.

7. **연속 2회 클린 패스가 거짓 음성을 방지한다**: 단일 리뷰 패스는 문제를 놓칠 수 있다. 발견 사항 없이 연속 2회 패스를 요구하면, 모순되거나 불완전한 컨텍스트를 배포할 가능성이 크게 줄어든다.

### Naia OS의 입장

대부분의 오픈소스 프로젝트가 AI 기여를 **차단**하려는 동안, Naia OS는 AI 기여를 **구조적으로 수용**하려는 최초의 본격적인 시도 중 하나다.

이것이 성공하면, AI 네이티브 오픈소스의 레퍼런스 모델이 된다.
실패하더라도, 생태계에 가치 있는 실험 데이터를 남긴다.

어느 쪽이든, 시도할 가치가 있다.
