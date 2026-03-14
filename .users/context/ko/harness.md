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

### commit-guard.js

| | |
|---|---|
| **트리거** | PostToolUse on Bash (git commit 명령) |
| **목적** | E2E 테스트 및 컨텍스트 동기화 완료 전 커밋 경고 |
| **동작** | 진행 파일을 읽고, phase가 sync_verify 미만이면 경고 |

페이즈 순서 (커밋 전 `sync_verify`까지 도달해야 함):
```
issue → understand → scope → investigate → plan →
build → review → e2e_test → post_test_review →
sync → sync_verify → report → commit
```

진행 파일이 없으면 경고 없이 통과 (비기능 작업 대응).

---

## 진행 파일 (Progress Files)

**위치**: `.agents/progress/*.json` (gitignored — 세션 로컬 전용)

목적: 세션 핸드오프. 세션이 끝나거나 컨텍스트가 압축될 때, 다음 AI 세션이 현재 상태를 파악할 수 있음.

### 스키마

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
  "surprises": [],
  "blockers": [],
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

---

## 테스트

```bash
bash .agents/tests/harness/run-all.sh
```

28개 테스트:
- 엔트리포인트 동기화 (6개)
- 커밋 가드 (8개)
- 캐스케이드 체크 (8개)
- 진행 파일 스키마 (4개)
- 통합 라이프사이클 (2개)

---

## 디렉토리 구조

### Git에 커밋됨

```
.claude/
├── settings.json              # 훅 등록
└── hooks/
    ├── sync-entry-points.js   # 엔트리포인트 3파일 동기화
    ├── cascade-check.js       # 삼중 미러링 알림
    └── commit-guard.js        # 페이즈 인식 커밋 가드

.agents/
├── context/harness.yaml       # 이 컨텍스트 (SoT)
├── progress/.gitkeep          # 진행 파일 디렉토리
└── tests/harness/run-all.sh   # 테스트 스위트
```

### Gitignored

```
.claude/*          (settings.json과 hooks/ 제외)
.agents/progress/*.json
```
