<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Harness Engineering (하네스 엔지니어링)

> SoT: `.agents/context/harness.yaml`의 한국어 미러

AI 에이전트가 규칙을 반복적으로 위반하지 않도록 Claude Code 훅을 통해 기계적으로 시행하는 시스템.
개념: "AI가 같은 실수를 반복하지 않도록 환경 자체를 엔지니어링한다."

## 개요

텍스트 기반 규칙(CLAUDE.md, agents-rules.json)은 긴 세션이나 컨텍스트 압축 중에 잊혀짐. 하네스 엔지니어링은 **기계적 시행**을 추가 — 도구 호출을 실시간으로 가로채서 규칙 위반을 물리적으로 방지하거나 경고.

세 가지 기둥:

| 기둥 | 목적 | 위치 |
|------|------|------|
| **훅** | 편집/명령을 실시간으로 가로채기 | `.claude/hooks/` |
| **진행 파일** | 세션 간 상태 전달 | `.agents/progress/` |
| **테스트** | 모든 훅이 올바르게 동작하는지 검증 | `.agents/tests/harness/` |

---

## Claude Code 훅

`.claude/settings.json`에 등록. 모든 훅은 PostToolUse 이벤트 사용.

### 훅 프로토콜

- **입력**: stdin JSON — `{ tool_name, tool_input, cwd, session_id }`
- **출력**: stdout JSON — `{ reason, hookSpecificOutput: { hookEventName, additionalContext } }`
- 훅은 컨텍스트 주입(권고) 또는 도구 실행 차단(PreToolUse만) 가능

### sync-entry-points.js

| | |
|---|---|
| **트리거** | PostToolUse on Edit\|Write |
| **목적** | CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md 자동 동기화 |
| **동작** | 편집된 엔트리포인트를 나머지 두 파일에 복사 (존재하는 경우만) |
| **시행 규칙** | Cascade 규칙 — 엔트리포인트 파일은 항상 동일해야 함 |

- 임시 락파일로 재귀 동기화 루프 방지
- 존재하는 파일에만 동기화 (GEMINI.md가 없으면 생성하지 않음)

### cascade-check.js

| | |
|---|---|
| **트리거** | PostToolUse on Edit\|Write |
| **목적** | 삼중 미러링 업데이트 알림 |
| **동작** | 권고 알림 (차단하지 않음) |

감지 패턴:
- `.agents/context/*.yaml|json` → `.users/context/` + `.users/context/ko/` 알림
- `.users/context/*.md` (`ko/` 제외) → `.agents/` + `.users/context/ko/` 알림
- `.users/context/ko/*.md` → `.agents/` + `.users/context/` 알림
- `agents-rules.json` → SoT 추가 경고

### process-guard.js

| | |
|---|---|
| **트리거** | Stop (AI 응답 종료 시) |
| **목적** | "선언 ≠ 행동" 감지 — 실제 파일 읽기 없이 리뷰 완료를 선언하는 패턴 차단 |
| **동작** | 트랜스크립트 JSONL 마지막 128KB 파싱; 마지막 어시스턴트 메시지에 리뷰 완료 키워드가 있는데 Read/Grep/Glob 호출이 없으면 `decision: "block"` 반환 |
| **강제 규칙** | 반복 리뷰: 매 패스마다 실제 파일 읽기 필수, 연속 2회 클린 패스여야 완료 |

감지 키워드: `수정 없음`, `변경 없음`, `클린 패스`, `clean pass`, `no changes found`, `found no issues`, `이상 없음` 등.

영감: [open-swe `ensure_no_empty_msg` 패턴](https://github.com/langchain-ai/open-swe)

### commit-guard.js

| | |
|---|---|
| **트리거** | PostToolUse on Bash (git commit 명령) |
| **목적** | E2E 테스트/컨텍스트 동기화 전 커밋 경고 + Lore 트레일러 알림 |
| **동작** | 진행 파일을 읽고 (1) phase가 sync_verify 미만이면 경고, (2) rejected_alternatives가 기록된 경우 Rejected: 트레일러 권고, (3) constraints_discovered가 기록된 경우 Constraint: 트레일러 권고, (4) upstream_issue_ref가 설정된 경우 .agents/를 upstream PR diff에서 제외하라는 advisory |

페이즈 순서 (커밋 전 `sync_verify`까지 도달해야 함):
```
issue → understand → scope → investigate →
research_artifact → annotation_cycle → plan →
build → review → e2e_test → post_test_review →
sync → sync_verify → report → commit
```

진행 파일이 없으면 경고 없이 통과 (비기능 작업 대응).

---

## 진행 파일 (Progress Files)

**위치**: `.agents/progress/*.json` (gitignored — 세션 로컬 전용)

목적: 세션 핸드오프. 세션이 끝나거나 컨텍스트가 압축될 때, 다음 AI 세션이 현재 상태를 파악할 수 있음.

### 스키마

| 필드 | 설명 |
|------|------|
| `issue` | GitHub Issue 참조 (예: `#42`) |
| `title` | 작업 요약 |
| `project` | 프로젝트 이름 (예: `naia-os`) |
| `current_phase` | 페이즈 순서에서의 현재 단계 |
| `gate_approvals` | 게이트 → 사용자 승인 ISO 타임스탬프 맵 |
| `decisions` | 핵심 결정 배열 (decision, rationale, date) |
| `rejected_alternatives` | **(T2)** 검토했으나 거절된 접근법 (approach, reason, date) — investigate/plan 중 기록 |
| `constraints_discovered` | **(T2)** 결정을 형성한 기술적 제약 (constraint, scope, date) — investigate/build 중 기록 |
| `surprises` | 조사/빌드 중 예상치 못한 발견 |
| `blockers` | 진행을 막는 현재 블로커 |
| `test_findings` | 테스트 실패 진단 결과 — e2e_test에서 build/plan으로 되돌아가기 전 필수 기록. 필드: test_name, error_summary, root_cause, routing |
| `review_evidence` | **(T3 안티치트)** 반복 리뷰가 실제로 수행됐다는 증거. 필드: pass, files_read[], issues_found[], date. issues_found가 빈 패스 2회 연속 = 리뷰 완료. `/review` 스킬 사용. |
| `upstream_issue_ref` | *(선택)* OSS 기여 작업 시 upstream 레포 이슈 참조 — 예: `vllm-project/vllm#16052`. commit-guard가 .agents/를 upstream PR에서 제외하라는 advisory 출력. |
| `updated_at` | 마지막 업데이트 ISO 타임스탬프 |

### 예시

```json
{
  "issue": "#42",
  "title": "아바타 idle 애니메이션 추가",
  "project": "naia-os",
  "current_phase": "build",
  "gate_approvals": {
    "understand": "2026-03-14T10:00Z",
    "scope": "2026-03-14T10:15Z",
    "plan": "2026-03-14T11:00Z"
  },
  "decisions": [
    {
      "decision": "Three.js AnimationMixer로 idle 구현",
      "rationale": "업스트림 VRM이 사용, 커스텀 코드 최소화",
      "date": "2026-03-14"
    }
  ],
  "rejected_alternatives": [
    {
      "approach": "AudioContext({sampleRate:16000})",
      "reason": "WebKitGTK에서 오디오가 zeros로 고정됨",
      "date": "2026-03-17"
    }
  ],
  "constraints_discovered": [
    {
      "constraint": "WebKitGTK AudioContext — 기본 sampleRate만 허용",
      "scope": "shell/src/audio/*",
      "date": "2026-03-17"
    }
  ],
  "surprises": [],
  "blockers": [],
  "test_findings": [
    {
      "test_name": "03-basic-chat.spec.ts",
      "error_summary": "Expected non-empty response, got empty string",
      "root_cause": "Gateway connection timeout — agent not spawned",
      "routing": "implementation_issue → BUILD"
    }
  ],
  "updated_at": "2026-03-14T14:30Z"
}
```

### 업데이트 시점

1. 게이트 승인 (understand, scope, plan, sync)
2. Build phase 시작
3. Build 하위 phase 완료
4. 세션 종료 (필수)
5. 예상치 못한 발견 또는 블로커 발생
6. 페이즈 전환
7. **investigate/plan 중 접근법 거절 → `rejected_alternatives[]`에 추가**
8. **investigate/build 중 제약 발견 → `constraints_discovered[]`에 추가**
9. **리뷰 패스 완료 → `review_evidence[]`에 추가** (`/review` 스킬 사용)

---

## 컨텍스트 업데이트 매트릭스 (T4: 컨텍스트 거버넌스)

> `issue-driven-development.yaml`의 `artifact_storage`를 확장.
> 지식 유형별로 어디에 기록할지 기준을 정의해 AI 에이전트의 예측 불가능한 행동을 줄임.

| 위치 | 대상 | 언제 |
|------|------|------|
| **세션 로컬** | `.agents/progress/*.json` (gitignored) | 임시 상태 — 현재 phase, 진행 중 결정, rejected_alternatives, constraints_discovered |
| **누적 교훈** | `.agents/context/lessons-learned.yaml` | 이번 세션에서 실수가 교정됨, 또는 반복 패턴 발견 |
| **도메인 컨텍스트** | `.agents/context/{domain}.yaml` | 영구 기술 제약 확인, 아키텍처 결정 확정, 안정적 프로세스 확립 |
| **하네스 업데이트** | `.claude/hooks/*.js` | **같은 실수가 lessons-learned에 2회 이상 등장** — 이제 기계적 시행이 필요 |

### 하네스 업데이트 규칙

같은 실수가 `lessons-learned.yaml`에 두 번 등장하면:
1. 반복 패턴 식별
2. **실패하는 테스트를 먼저 작성** (하네스 TDD)
3. 테스트를 통과시키는 훅 구현
4. `harness.yaml` coverage 카운트 업데이트

> 같은 실수에 대해 세 번째 교훈 항목을 추가하지 말 것. 대신 훅을 강화.

---

## 테스트

```bash
bash .agents/tests/harness/run-all.sh
```

77개 테스트:
- 엔트리포인트 동기화 (11개)
- 커밋 가드 (31개 — T2 Decision Shadow advisory + 게이트 승인 체크 + upstream contribution advisory + 새 phase 4.5/4.7 커버리지 포함)
- 캐스케이드 체크 (12개)
- 진행 파일 스키마 (7개)
- 통합 라이프사이클 (2개)
- 프로세스 가드 (14개)

---

## 디렉토리 구조

### Git에 커밋됨

```
.claude/
├── settings.json              # 훅 등록
├── hooks/
│   ├── sync-entry-points.js   # 엔트리포인트 3파일 동기화
│   ├── cascade-check.js       # 삼중 미러링 알림
│   ├── commit-guard.js        # 페이즈 인식 커밋 가드
│   └── process-guard.js       # 파일 읽기 없는 리뷰 선언 차단 (Stop 훅)
└── skills/                    # 심링크 → .agents/skills/ (Claude Code 진입점)

.agents/
├── context/harness.yaml       # 이 컨텍스트 (SoT)
├── skills/*/SKILL.md          # Claude Code 스킬 SoT
├── progress/.gitkeep          # 진행 파일 디렉토리
└── tests/harness/run-all.sh   # 테스트 스위트
```

### Gitignored

```
.claude/*          (settings.json, hooks/, skills/ 제외)
.agents/progress/*.json
```
