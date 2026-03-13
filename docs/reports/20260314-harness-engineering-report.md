# Harness Engineering 조사 및 적용 보고서

**날짜**: 2026-03-14
**범위**: Harness Engineering 개념 조사, Naia OS 적용, 검증

---

## 1. Harness Engineering이란?

Mitchell Hashimoto가 2026년 2월에 제안한 개념으로, **"AI 에이전트가 같은 실수를 반복하지 않도록 환경 자체를 엔지니어링하는 것"**을 의미한다.

핵심 아이디어: 텍스트 기반 규칙(CLAUDE.md, AGENTS.md 등)은 긴 세션, 컨텍스트 압축, 세션 전환 중에 잊혀진다. 따라서 규칙을 **기계적으로 시행**해야 한다.

### OpenAI의 3대 축 (Three Pillars)

| 축 | 설명 | 우리 시스템 대응 |
|---|------|-----------------|
| **Context Engineering** | AI가 읽는 컨텍스트를 구조적으로 설계 | `.agents/` 듀얼 디렉토리, 온디맨드 로딩 |
| **Architectural Constraints** | 린터/구조적 테스트로 위반 방지 | Claude Code 훅 (PostToolUse) |
| **Entropy Management** | 가비지 컬렉션 에이전트로 컨텍스트 오염 방지 | 진행 파일 + 반복 리뷰 |

---

## 2. 조사 범위

25+ 오픈소스 레포, 10+ 아티클을 조사했다.

### 주요 참조 소스

| 소스 | 핵심 내용 | 채택 여부 |
|------|----------|----------|
| **Mitchell Hashimoto 블로그** | Harness Engineering 개념 원론 | ✅ 개념 채택 |
| **Anthropic Claude Code Hooks** | PostToolUse/PreToolUse JSON 프로토콜 | ✅ 핵심 구현 기반 |
| **OpenAI Context Engineering** | 3대 축, Progressive Disclosure | ✅ 이미 적용 중 확인 |
| **deepagents (LangChain)** | Loop Detection, Reasoning Sandwich | ❌ 실제 코드에 미구현 확인 |
| **cursor-memory-bank** | SQLite 상태 저장, 5계층 인지 메모리 | ❌ 과도한 복잡성 |
| **cline-architect** | Agent Teams, Plan-Execute 분리 | ❌ 단일 에이전트 환경 부적합 |
| **awesome-cursorrules** | 500+ 규칙 모음 | 참조만 (텍스트 규칙의 한계 확인) |
| **Anthropic 진행 파일 가이드** | JSON > Markdown (에이전트 파싱 안정성) | ✅ JSON 형식 채택 |

### 채택하지 않은 것과 이유

| 기술 | 미채택 이유 |
|------|-----------|
| **SQLite 상태 저장** | 오버엔지니어링 — JSON 파일이면 충분 |
| **5계층 인지 메모리** | 복잡성 대비 실효성 낮음 |
| **Loop Detection** | deepagents 블로그에 언급만 있고 실제 코드 없음 — 시스템 프롬프트 지시로 대체 |
| **Reasoning Sandwich** | Claude Code에서 모델 자동 전환 불가 |
| **TypeScript Guardrail Engine** | bash 훅으로 충분, TS 빌드 체인 불필요 |
| **Agent Teams** | 단일 Claude Code 세션 환경에서 의미 없음 |

---

## 3. 우리 시스템의 기존 강점

조사 결과, 25+ 레포 중 다음 패턴을 가진 프로젝트는 없었다:

| 우리의 고유 패턴 | 타 프로젝트 존재 여부 |
|----------------|:------------------:|
| **듀얼/트리플 디렉토리** (`.agents/` ↔ `.users/` ↔ `.users/ko/`) | 없음 |
| **키워드 라우팅** (`ai-work-index.yaml`로 온디맨드 로딩) | 없음 |
| **구조화된 lessons-learned** (YAML 누적) | 없음 |
| **병렬 세션 파일 락** (`file-locks.json`) | 없음 |
| **13페이즈 개발 워크플로우** (4 게이트 + 반복 리뷰) | 없음 |

이들은 이미 Context Engineering 축에서 상당히 성숙한 상태였다.

---

## 4. 식별된 갭과 해결

핵심 갭: **"텍스트 규칙 vs 기계적 시행"** — 우리의 cascade 규칙, 페이즈 순서, 미러링 요구사항이 모두 텍스트로만 존재했다.

### 갭 → 해결 매핑

| 갭 | 문제 | 해결 |
|---|------|-----|
| Entry point 동기화 | CLAUDE.md 수정 시 AGENTS.md/GEMINI.md 수동 복사 필요 | `sync-entry-points.js` 훅 (자동 복사) |
| 삼중 미러링 누락 | `.agents/` 수정 후 `.users/` 업데이트 잊음 | `cascade-check.js` 훅 (리마인더) |
| 조기 커밋 | E2E/sync 단계 건너뛰고 커밋 | `commit-guard.js` 훅 (페이즈 체크) |
| 세션 핸드오프 실패 | 컨텍스트 압축 시 진행 상태 소실 | `.agents/progress/*.json` 진행 파일 |
| 기존 훅 2파일만 동기화 | GEMINI.md 무시됨 | 3파일 동기화로 개선 |

---

## 5. 구현 상세

### 구현 위치

naia-os 워크트리 `harness-experiment` 브랜치에서 격리 실험.

### 3개 Claude Code 훅

모든 훅은 **PostToolUse** 이벤트를 사용하며, 도구 실행 후 컨텍스트를 주입하는 방식이다 (차단하지 않음).

#### sync-entry-points.js
- **트리거**: Edit|Write on CLAUDE.md/AGENTS.md/GEMINI.md
- **동작**: 편집된 파일 내용을 나머지 2개에 복사
- **안전장치**: 임시 lockfile로 재귀 방지, 존재하는 파일만 동기화
- **기존 대비 개선**: 루트 워크스페이스의 `sync-agent-rules.js`는 2파일만 동기화 → 3파일로 확장

#### cascade-check.js
- **트리거**: Edit|Write on 컨텍스트 파일
- **동작**: 삼중 미러 업데이트 리마인더 (`.agents/` ↔ `.users/` ↔ `.users/ko/`)
- **특별 처리**: agents-rules.json은 SoT 경고 추가

#### commit-guard.js
- **트리거**: Bash with `git commit`
- **동작**: `.agents/progress/*.json`에서 현재 페이즈를 읽고, sync_verify 이전이면 경고
- **안전**: 진행 파일 없으면 조용히 통과 (비기능 작업 대응)

### 진행 파일 (Progress Files)

Anthropic의 권고에 따라 Markdown이 아닌 **JSON 형식** 채택 (에이전트 파싱 안정성).

```json
{
  "issue": "#42",
  "current_phase": "build",
  "gate_approvals": { "understand": "ISO-timestamp", ... },
  "decisions": [{ "decision": "...", "rationale": "..." }],
  "surprises": [],
  "blockers": [],
  "updated_at": "ISO-timestamp"
}
```

- `.agents/progress/` 디렉토리에 저장
- **gitignored** — 세션 로컬 전용, 커밋되지 않음
- 6가지 업데이트 시점: 게이트 승인, 빌드 시작/완료, 세션 종료, 이상 발견, 페이즈 전환

---

## 6. 검증

### 자동화 테스트: 47개

| 카테고리 | 수 | 커버리지 |
|---------|:--:|---------|
| **sync-entry-points** | 11 | 3개 소스 방향, Write/Edit 모두, lockfile 재귀 방지, 파일 부재, 잘못된 JSON |
| **commit-guard** | 15 | 전체 13 페이즈, --amend 변형, 다중 진행 파일, 미지 페이즈, 빈 디렉토리, 잘못된 도구, 잘못된 JSON |
| **cascade-check** | 12 | 3방향 미러링, JSON/YAML 모두, SoT 이중 경고, Write 도구, 무관 파일, 잘못된 JSON |
| **진행 파일 스키마** | 7 | 유효성, 필수 필드, 페이즈 이름, ISO 타임스탬프, 누락 필드/무효 페이즈/빈 객체 내성 |
| **통합** | 2 | 전체 페이즈 라이프사이클 (경고 10 + 통과 3) |

**결과: 47/47 통과**

### 테스트 방법론

각 테스트는:
1. `mktemp`으로 격리된 임시 디렉토리 생성
2. Claude Code 프로토콜 JSON을 stdin으로 훅에 전달
3. 훅의 stdout/파일시스템 변경을 검증
4. 테스트 후 임시 디렉토리 정리

이는 실제 Claude Code 런타임과 동일한 I/O 프로토콜을 사용하므로, 훅의 실제 동작을 충실히 검증한다.

### 온보딩 테스트: 10개 시나리오

AI 에이전트가 하네스 시스템을 올바르게 이해하고 사용하는지 검증하는 프롬프트 기반 시나리오 (`.agents/tests/harness-onboarding-test.md`).

---

## 7. 반복 리뷰 결과

모든 구현과 문서에 반복 리뷰 (연속 2회 클린 패스) 적용:

| 단계 | Pass 1 수정 | Pass 2 수정 | Pass 3 수정 |
|------|:---------:|:---------:|:---------:|
| 훅 구현 + 기본 테스트 | 1건 (SPDX 헤더) | 0건 | 0건 ✅ |
| 문서 + 온보딩 | 0건 | 0건 ✅ | — |
| 테스트 보강 (47개) | 0건 | 0건 ✅ | — |

---

## 8. 커밋 내역

| 커밋 | 내용 | 파일 |
|------|------|:----:|
| `ddd65d0` | 핵심 구현 (훅 3개 + 컨텍스트 + 기본 테스트 28개) | 18 |
| `99a26ea` | 온보딩 테스트 + 워크플로우 미러 | 3 |
| `bdfe750` | 테스트 보강 (28 → 47) | 2 |

---

## 9. 결론

### 우리가 이미 강했던 것
- Context Engineering (듀얼/트리플 디렉토리, 온디맨드 로딩, lessons-learned)
- 프로세스 구조화 (13페이즈, 4 게이트, 반복 리뷰)

### 이번에 보강한 것
- **Architectural Constraints**: 3개 훅으로 cascade 규칙, 페이즈 순서, 엔트리포인트 동기화를 기계적 시행
- **Entropy Management**: 진행 파일로 세션 간 상태 보존

### 핵심 원칙
> 텍스트 규칙은 잊혀진다. 기계적 시행은 잊혀지지 않는다.

---

## 10. 다음 단계

- [ ] 사용자 검토 후 `harness-experiment` → main 머지
- [ ] 루트 워크스페이스(`~/dev/`)에도 동일 패턴 적용 (기존 훅 중복 버그 수정 포함)
- [ ] CLAUDE.md 영어 전환 (AI 토큰 효율)
