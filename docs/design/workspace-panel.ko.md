# Workspace Panel — 설계 문서

> 관련 이슈: [#99](https://github.com/nextain/naia-os/issues/99)
> 작성일: 2026-03-20 · 상태: 초안 (설계 검토 중)

---

## 목차

1. [문제 정의](#1-문제-정의)
2. [요구사항](#2-요구사항)
3. [기능 요구사항](#3-기능-요구사항)
4. [디자인 컨셉](#4-디자인-컨셉)
5. [사용자 시나리오](#5-사용자-시나리오)
6. [기술 설계](#6-기술-설계)
7. [확장성 설계](#7-확장성-설계)
8. [참고 자료 및 근거](#8-참고-자료-및-근거)
9. [페이즈 설계](#9-페이즈-설계)
10. [멀티터미널 설계](#10-멀티터미널-설계-115)

---

## 1. 문제 정의

### 1.1 현재 상황

Luke는 단일 `dev` 디렉토리 아래에서 여러 Claude Code 세션을 동시에 운영한다.

```
/var/home/luke/dev/          ← 상위 레포 (홈)
├── naia-os/                 ← 메인 프로젝트
├── naia-os-issue-79/        ← naia-os git worktree (이슈 브랜치)
├── naia-os-issue-89/        ←
├── naia-os-issue-95/        ←
├── naia.nextain.io/         ← 별개 레포
├── project-any-llm/         ←
├── vllm/                    ←
├── ref-cline/               ← 참조 레포 (읽기 전용)
├── ref-opencode/            ←
├── docs-work-logs/          ← 문서 서브모듈
└── ...                      ← 뒤섞인 30+ 디렉토리
```

각 Claude Code 세션은 별도 터미널에서 돌고 있다. Naia OS 자체는 `naia-os/` 안에서 실행 중이다.

### 1.2 핵심 고통점

**1. 세션 가시성 없음**
멀티 터미널로 여러 Claude Code 세션을 동시에 돌리는데, 지금 각 세션이 뭘 하고 있는지 알려면 터미널을 직접 클릭해서 확인해야 한다. 세션이 3개 이상이면 추적이 불가능해진다.

**2. 콘텐츠 보기 불편**
터미널 안에서 코드 출력이나 파일 내용을 보려면 별도 에디터를 띄워야 한다. 복사-붙여넣기가 필요하고, 두 창을 오가는 마찰이 크다.

**3. dev 구조 파악 불가**
`dev` 아래 30개 이상의 디렉토리가 섞여 있다. 메인 프로젝트인지, 이슈 워크트리인지, 참조 레포인지, 문서인지 한눈에 구분이 안 된다.

**4. 마크다운 편집 마찰**
개발 워크플로우에서 마크다운 파일(CLAUDE.md, AGENTS.md, 설계문서, 작업로그)을 매우 많이 만든다. 터미널에서 읽고 수정하는 것은 불편하고, 별도 에디터를 열면 컨텍스트가 분산된다. 이는 Luke만의 문제가 아니다 — 마크다운은 2025년 기준 개발자 표준 문서 형식이며, 일반 사용자들도 Obsidian 같은 마크다운 기반 노트 도구를 요청해왔다.

**5. Naia의 감시 공백**
각 세션이 무엇을 하는지 Naia가 모른다. "지금 3개 세션 중 뭐가 문제야?"라고 물어볼 수 없다.

### 1.3 문제의 근본 원인

```
세션이 분산된 터미널에서 실행됨
          ↓
가시성 없음 → 세션마다 직접 확인 필요
          ↓
컨텍스트 스위칭 발생 → 집중력 손실
          ↓
실수 감지 늦어짐 → Naia가 감시 불가
```

---

## 2. 요구사항

### 2.1 핵심 목표

> "Naia가 모든 Claude Code 세션의 상황을 알고 있고, 사용자는 터미널 전환 없이 파일을 보고 편집할 수 있는 상태."

### 2.2 기능 요구사항 요약

| # | 요구사항 | 우선순위 |
|---|---------|---------|
| F1 | Claude Code 세션 상태 대시보드 — 전체 세션 카드 그리드 | P1 |
| F2 | 실시간 세션 활동 감지 — 어떤 파일이 변경되고 있는지 | P1 |
| F3 | 파일 탐색기 — dev 디렉토리 구조, 분류 표시 | P1 |
| F4 | 코드 + 마크다운 에디터 — 터미널 이탈 없이 편집 | P1 |
| F5 | 세션 클릭 → 해당 파일 에디터에 즉시 표시 | P1 |
| F6 | Naia 컨텍스트 — 세션 상태를 AI 시스템 프롬프트에 주입 | P1 |
| F10 | progress.json 기반 이슈/단계 표시 — 세션 카드에 표시 | P1 |
| F7 | 디렉토리 자동 분류 — Naia가 메인/워크트리/참조/문서 구분 추천 | P2 |
| F8 | 세션 상태 알림 — 에러/대기 상태 감지 시 Naia 알림 | P2 |
| F9 | 마크다운 프리뷰 — 렌더링 뷰 전환 | P2 |
| F11 | 파일 변경 히스토리 — 세션별 최근 수정 파일 목록 | P3 |
| F12 | ACP(Agent Client Protocol) 호환 — 외부 에이전트 연결 준비 | P3 |

### 2.3 비기능 요구사항

- **실시간성**: 파일 변경 감지 < 1초 (inotify 기반)
- **성능**: 파일 탐색기 초기 로드 < 500ms (30개 디렉토리 기준)
- **Tauri/WebKitGTK 호환**: 기존 shell 아키텍처 준수
- **builtIn 패널**: 삭제 불가, `panelRegistry`에 `builtIn: true`로 등록 (기존 구조 유지)
- **패널 스펙 변경 없음**: `PanelDescriptor` 변경 불필요. `center` 컴포넌트가 전체 레이아웃 소유
- **오프라인 동작**: 파일 시스템 기반이므로 네트워크 불필요
- **사용자 설정**: 모니터링 대상 디렉토리 목록 설정 가능 (하드코딩 금지)

---

## 3. 기능 요구사항

### 3.1 세션 대시보드 `F1 F2 F8 F10`

**개요**: 현재 실행 중인 모든 Claude Code 세션을 카드 그리드로 표시한다.

**카드 표시 정보**:
- 세션 디렉토리 이름 (e.g. `naia-os-issue-79`)
- 브랜치명 (git 기반)
- 현재 상태: `🟢 활성` / `🟡 대기` / `🔴 오류` / `⚫ 중단`
- progress.json 존재 시: 이슈 번호 + 현재 단계 (e.g. `#79 · Build`)
- 최근 변경 파일명 (inotify 기반 실시간)
- 마지막 활동 시각

**상태 감지 방법**:
- `active`: 최근 30초 이내 파일 변경 감지
- `idle`: 파일 변경 없음 (프로세스 존재 여부 미확인)
- `error`: 에러 파일 패턴 감지 (stderr 로그 등)
- `stopped`: 30분 이상 파일 변경 없음 + 프로세스 미감지

**Naia 알림 `F8`**:
- 세션 상태가 `idle` 5분 이상 → Naia 토스트: "naia-os-issue-79 세션이 입력을 기다리고 있어요"
- 에러 감지 → Naia 채팅으로 알림

### 3.2 파일 탐색기 `F3 F7`

**개요**: dev 디렉토리를 트리 구조로 표시하고 Naia가 분류를 추천한다.

**디렉토리 분류 (`F7`)**:
Naia가 디렉토리 이름 패턴 + git 상태로 자동 분류 제안:

| 분류 | 감지 규칙 | 예시 |
|------|----------|------|
| 메인 프로젝트 | git repo, 활성 작업 있음 | `naia-os`, `naia.nextain.io` |
| 이슈 워크트리 | `git worktree list`에 포함 | `naia-os-issue-79` |
| 참조 레포 | `ref-` 접두어 또는 설정 태그 | `ref-cline`, `ref-opencode` |
| 문서 | `docs-` 접두어 또는 설정 태그 | `docs-work-logs` |
| 기타 | 위에 해당 없음 | `my-envs`, `timetable` |

**분류 기술 기반**:
- **1단계 (휴리스틱)**: 디렉토리 이름 패턴 + `git worktree list` 결과로 자동 분류 (네트워크 불필요, 빠름)
- **2단계 (LLM)**: 휴리스틱으로 분류 불가한 디렉토리는 Naia에게 판단 위임 (디렉토리 이름 + README 첫 줄 기반)

분류는 추천만 하고 사용자가 최종 확정. 설정 파일에 저장.

**파일 트리**:
- 디렉토리 접기/펼치기
- 분류별 색상/아이콘 구분
- 활성 세션이 있는 디렉토리 강조 표시
- 클릭 시 에디터에 파일 열기

### 3.3 에디터 `F4 F5 F9`

**개요**: 터미널 이탈 없이 코드와 마크다운을 읽고 편집한다.

**지원 파일 타입**:
- 코드: 신택스 하이라이팅 (TypeScript, Rust, Python, JSON, YAML 등)
- 마크다운: 편집 모드 + 렌더링 프리뷰 전환 (`F9`)

**세션 연동 (`F5`)**:
세션 카드 클릭 시:
1. 해당 세션의 최근 변경 파일을 에디터에 자동 오픈
2. 파일이 없으면 해당 디렉토리의 `AGENTS.md` 또는 `README.md` 오픈
3. progress.json 있으면 이슈 정보를 에디터 상단 배지로 표시

**편집**:
- 저장: 자동저장 (입력 후 800ms debounce) + Ctrl+S 즉시저장
- 기본 편집 기능 (선택, 복사, 붙여넣기)
- 읽기 전용 모드 (참조 레포 등)

### 3.4 Naia 컨텍스트 연동 `F6`

**개요**: 워크스페이스 패널의 세션 상태를 Naia의 시스템 프롬프트에 주입한다.

**주입 데이터**:
```
현재 활성 Claude Code 세션:
- naia-os-issue-79 [🟢 활성] #79 · Build · 최근: shell/src/lib/stt/registry.ts
- naia.nextain.io [🟡 대기 2분] #8 · E2E
- vllm [⚫ 중단]
```

**활용**:
- "지금 어떤 세션이 문제야?" → Naia가 대시보드 데이터로 즉시 답변
- "naia-os 세션 뭐하고 있어?" → 최근 변경 파일 기반으로 설명

---

## 4. 디자인 컨셉

### 4.1 핵심 철학

> "에이전트를 눈으로 볼 수 있어야 관리할 수 있다."
> Warp ADE가 터미널 중심으로 구현한 것을 Naia OS는 AI-native 환경으로 구현한다.

### 4.2 UI 레이아웃 (C형 — 탐색기 고정 + 우측 전환)

```
┌──────────────────────────────────────────────────────────────┐
│  Naia 패널 (좌측, 기존)   │  Workspace Panel (우측, 신규)    │
│                           │                                  │
│  [Naia 아바타]            │ ┌─────────┬────────────────────┐ │
│                           │ │  파일   │ 세션 대시보드       │ │
│  [채팅]                   │ │  탐색기 │ ┌──────┐ ┌──────┐  │ │
│  "naia-os 세션 뭐해?"     │ │         │ │🟢 #79│ │🟡 .io│  │ │
│                           │ │  dev/   │ │Build │ │E2E   │  │ │
│  "issue-79에서            │ │  ├ naia │ │stt.. │ │2분   │  │ │
│   stt/registry.ts를       │ │  ├ .io  │ └──────┘ └──────┘  │ │
│   수정 중이에요"          │ │  ├ vllm │                    │ │
│                           │ │  └ ...  ├────────────────────┤ │
│                           │ │         │ 에디터             │ │
│                           │ │         │ stt/registry.ts    │ │
│                           │ │         │ ···················│ │
│                           │ └─────────┴────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 세션 카드 상태 표시

```
┌─────────────────────────────────┐
│ 🟢 naia-os-issue-79             │
│    branch: issue-79-qwen3-asr   │
│    #79 · Build 단계             │
│    shell/src/lib/stt/registry.ts│
│    방금 전                      │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 🟡 naia.nextain.io              │
│    branch: main                 │
│    #8 · E2E 단계                │
│    입력 대기 중 · 2분 전        │
└─────────────────────────────────┘
```

### 4.4 인터랙션 패러다임

**대화 + 직접 조작 혼합**
- Naia에게 "naia-os 세션 어때?" → 카드 상태 읽어서 답변
- 카드 클릭 → 에디터에 파일 오픈
- 탐색기 파일 클릭 → 에디터 오픈

**실시간 갱신**
- inotify 기반 파일 변경 감지 → 카드 상태 자동 업데이트
- 에디터는 외부 변경 시 reload 감지

---

## 5. 사용자 시나리오

### 시나리오 1: 멀티 세션 모니터링

```
상황: 3개 Claude Code 세션이 동시에 돌고 있음

Workspace 패널:
  🟢 naia-os-issue-79   Build · stt/registry.ts (방금)
  🟡 naia.nextain.io    E2E · 입력 대기 2분
  🔴 vllm               오류 감지됨

Luke: "vllm 뭐가 문제야?"
Naia: "vllm 세션에서 오류가 감지됐어요.
       최근 수정 파일: server/engine/async_llm_engine.py
       에디터에서 볼까요?"

Luke: "응"
→ 에디터에 async_llm_engine.py 자동 오픈
```

### 시나리오 2: 터미널 이탈 없이 파일 보기

```
상황: naia-os-issue-79 카드 클릭

→ 에디터: stt/registry.ts 자동 오픈 (세션이 마지막 수정한 파일)
→ 에디터 상단 배지: "#79 · Build 단계"

Luke: (코드 읽고) "이 부분 Naia한테 설명해줘"
Naia: (에디터 컨텍스트 + 세션 상태 기반으로 설명)
```

### 시나리오 3: 마크다운 편집

```
상황: 탐색기에서 naia-os/docs/design/workspace-panel.ko.md 클릭

→ 에디터에 파일 오픈 + 마크다운 렌더링 프리뷰

Luke: (내용 수정 후 Ctrl+S로 저장)
→ naia-os 세션 카드: 파일 변경 감지 → 상태 업데이트
```

### 시나리오 4: Naia 디렉토리 분류 추천

```
상황: 처음 워크스페이스 패널 열기

Naia: "dev 디렉토리를 분석했어요. 분류 추천:
       - 메인 프로젝트 (6개): naia-os, naia.nextain.io, ...
       - 이슈 워크트리 (3개): naia-os-issue-79, -89, -95
       - 참조 레포 (8개): ref-cline, ref-opencode, ...
       - 문서 (3개): docs-work-logs, docs-nextain, ...
       - 기타 (12개): my-envs, timetable, ...
       이대로 적용할까요?"

Luke: "응, 적용해"
→ 탐색기에 분류별 섹션 표시
```

### 시나리오 5: 세션 대기 알림

```
상황: naia.nextain.io 세션이 5분째 입력 대기 중

Naia (토스트 + 채팅):
  "naia.nextain.io 세션이 5분째 기다리고 있어요.
   확인해볼까요?"

Luke: "응"
→ 해당 세션 카드 클릭 → 에디터에 마지막 파일 오픈
```

---

## 6. 기술 설계

### 6.1 아키텍처

```
┌─────────────────────────────────────────────────────┐
│               WorkspaceCenterPanel (React)           │
│  ┌──────────┐ ┌────────────────┐ ┌────────────────┐ │
│  │ FileTree │ │ SessionDashboard│ │  Editor        │ │
│  │          │ │  (카드 그리드) │ │  (코드/MD)     │ │
│  └──────────┘ └────────────────┘ └────────────────┘ │
│               ↑ Tauri events    ↑ Tauri invoke        │
└─────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────┐
│               Tauri Backend (Rust)                   │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │  fs_watcher      │  │  workspace_commands      │  │
│  │  (notify crate)  │  │  - list_dirs             │  │
│  │  inotify 기반    │  │  - read_file             │  │
│  │  파일변경 → emit │  │  - write_file            │  │
│  └──────────────────┘  │  - get_git_info          │  │
│                         │  - get_progress          │  │
│                         └─────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 6.2 파일 감지 — Rust `notify` 크레이트

**세션 디렉토리 발견 전략**:
1. 사용자 설정에서 모니터링 대상 프로젝트 목록 로드 (config.ts)
2. 설정 없으면 dev 루트(`/var/home/luke/dev`) 직접 스캔 → git repo인 디렉토리만 수집
3. `git worktree list` 결과로 워크트리 추가 감지
4. 발견된 디렉토리 전체를 watch 등록

```rust
// tauri-plugin-fs-watch 또는 직접 notify 크레이트 사용
// 각 세션 디렉토리를 watch → 변경 이벤트 → Tauri event emit
watcher.watch(session_dir, RecursiveMode::Recursive)?;
// → "workspace_file_changed" 이벤트로 프론트엔드에 전달
```

- `tauri-plugin-fs-watch` 공식 플러그인 우선 검토
- 폴백: `notify` 크레이트 직접 사용

### 6.3 세션 상태 판단

```typescript
type SessionStatus = "active" | "idle" | "error" | "stopped";

// active: 최근 30초 이내 파일 변경 감지
// idle: 파일 변경 없음 (프로세스는 존재 또는 미확인)
// error: 에러 패턴 감지 — 아래 중 하나 이상 해당:
//   - .agents/progress/*.json의 current_phase가 이전 값과 동일한 채 10분 경과
//   - 디렉토리 내 *.error, crash.log 등 에러 파일 존재
//   - (선택적) /proc 스캔으로 claude 프로세스 exit 감지
// stopped: 30분 이상 파일 변경 없음 + 프로세스 미감지
```

**progress.json 경로 (다중 디렉토리)**:
- `{session_dir}/.agents/progress/*.json` — 각 세션 디렉토리마다 개별 스캔
- 파일 없으면 이슈/단계 정보 "없음" 표시 (에러 아님)

### 6.4 에디터 — CodeMirror 6

- 기존 naia-os shell 번들에 추가 (Monaco는 번들 크기 과다)
- 코드: 신택스 하이라이팅 (lezer 파서)
- 마크다운: `@codemirror/lang-markdown` + 프리뷰는 `marked` 또는 `micromark`
- 저장: Tauri `write_file` invoke

### 6.5 Naia 컨텍스트 브리지 (`pushContext`)

`NaiaContextBridge.pushContext()` 를 사용해 세션 상태를 주기적으로 업데이트:

```typescript
naia.pushContext({
  type: "workspace",
  data: {
    sessions: [
      { dir: "naia-os-issue-79", status: "active", branch: "issue-79-qwen3-asr",
        issue: "#79", phase: "build", recentFile: "shell/src/lib/stt/registry.ts" },
      { dir: "naia.nextain.io", status: "idle", branch: "main",
        issue: "#8", phase: "e2e", idleSince: 120 },
    ]
  }
});
```

### 6.6 NaiaTool 정의 (`skill_workspace_*`)

패널 공통 규칙: `NaiaTool.name`은 반드시 `skill_` 접두어 사용. 실행은 Shell-side (`naia.onToolCall()`).

```typescript
// PanelDescriptor.tools 에 등록
const WORKSPACE_TOOLS: NaiaTool[] = [
  {
    name: "skill_workspace_get_sessions",
    description: "현재 모니터링 중인 모든 Claude Code 세션의 상태를 반환한다",
    parameters: { type: "object", properties: {}, required: [] },
    tier: 0,  // auto (읽기 전용)
  },
  {
    name: "skill_workspace_open_file",
    description: "지정한 파일을 에디터에 연다",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "절대 또는 상대 경로" } },
      required: ["path"],
    },
    tier: 1,  // notify
  },
  // Phase 4에서 추가
  // { name: "skill_workspace_classify_dirs", ... }
];
```

**실행 흐름** (패널 공통 규칙 — Shell-side 실행):

```
LLM → skill_workspace_get_sessions 호출
  → Agent: panel_tool_call { toolName, args } → Shell 전달
  → Shell: NaiaContextBridge.callTool() → onToolCall 핸들러 실행
  → 결과를 panel_tool_result로 Agent에 반환
  → Agent → LLM에 결과 주입
```

패널 스킬 핸들러 등록 (mount 시):

```typescript
useEffect(() => {
  const unsub = naia.onToolCall("skill_workspace_get_sessions", () =>
    JSON.stringify(sessions)  // 현재 세션 스냅샷 반환
  );
  return unsub;
}, [naia, sessions]);
```

### 6.7 PanelDescriptor 등록 패턴

패널 공통 규칙 준수 — `onActivate/onDeactivate`로 파일 워쳐 생명주기 연결:

```typescript
// shell/src/panels/workspace/index.tsx
panelRegistry.register({
  id: "workspace",
  name: "워크스페이스",
  icon: "💻",
  builtIn: true,       // 삭제 불가
  source: "code",      // 빌드 타임 패널
  center: WorkspaceCenterPanel,
  tools: WORKSPACE_TOOLS,
  onActivate: () => {
    // Phase 2: Tauri fs watcher 시작
    startWorkspaceWatcher();
  },
  onDeactivate: () => {
    // Phase 2: watcher 정리 (리소스 해제)
    stopWorkspaceWatcher();
  },
});
```

> `center: React.ComponentType<PanelCenterProps>` 컴포넌트가 우측 전체 영역을 소유하므로
> `WorkspaceCenterPanel`이 내부 레이아웃(탐색기/대시보드/에디터 분할)을 자체 관리한다.
> **`PanelDescriptor` 인터페이스 변경 불필요.**

---

## 7. 확장성 설계

### 7.1 v1 (현재) — 단독 개발자

- 파일 시스템 기반 세션 감지 (inotify)
- progress.json 기반 이슈/단계 표시
- 로컬 에디터 (읽기/편집)
- Naia 컨텍스트 주입

### 7.2 v2 — ACP 호환

- Zed Agent Client Protocol 지원 → 외부 에이전트 연결
- Claude Code 세션이 ACP를 통해 Naia 워크스페이스에 직접 상태 보고
- 에디터가 ACP 클라이언트로서 외부 에이전트와 협력

### 7.3 v3 — 팀 지원

- 멀티 개발자 세션 모니터링
- 세션 상태를 팀 채널에 공유
- 이슈별 담당 세션 할당

---

## 8. 참고 자료 및 근거

### 제품 레퍼런스

| 제품 | 참고 기능 | 링크 |
|------|---------|------|
| Warp 2.0 ADE | Agent Management Panel — 에이전트 상태 중앙 모니터링 | [warp.dev/agents](https://www.warp.dev/agents) |
| Zed ACP | Agent Client Protocol — 에이전트-에디터 표준 프로토콜 | [zed.dev/acp](https://zed.dev/acp) |
| AgentRoom | pixel-art 시각화 도구 — Rust notify + Tauri 이벤트로 파일변경 → 프론트엔드 스트리밍 기술 패턴 참고 (production 레퍼런스 아님) | [github: liuyixin-louis/agentroom](https://github.com/liuyixin-louis/agentroom) |
| OpenCode | TUI AI 코딩 에이전트, ACP 공식 지원 — `ref-opencode`로 dev에 직접 포함됨. v2 ACP 연결 시 TUI 에이전트 상태 통합 가능한 확장성 레퍼런스 | [opencode.ai](https://opencode.ai) |
| VS Code Multi-root | 멀티루트 워크스페이스 UX 한계 (이슈 #256984) | [github.com/microsoft/vscode/issues/256984](https://github.com/microsoft/vscode/issues/256984) |
| Claude Code Agent Teams | 병렬 Claude Code 세션 오케스트레이션 | [docs.anthropic.com/en/docs/claude-code/sub-agents](https://docs.anthropic.com/en/docs/claude-code/sub-agents) |

### AI 도구 트렌드 (2025-2026)

| 항목 | 내용 |
|------|------|
| Agentmaxxing | 여러 AI 에이전트를 병렬 실행하는 개발 패턴 확산 (2026 트렌드) |
| Claude Code Q1 2026 | 전체 세션의 78%가 멀티파일 편집 (2025: 34%) ※검색 결과 기준, 1차 출처 미확인 |
| VS Code 2026.02 | "Your Home for Multi-Agent Development" 공식 선언 |

### 연구 근거

| 주제 | 수치 | 출처 |
|------|------|------|
| 집중 회복 시간 | 인터럽트 후 평균 23분 15초 / 복잡한 작업 45분 | UC Irvine 연구 |
| 컨텍스트 스위칭 비용 | 하루 45~90분 생산성 손실 | super-productivity.com |
| 재정 비용 | 개발자 1인당 연간 $50,000 손실 | DEV Community |
| Atlassian 2025 | 도구 간 전환 = 개발자 생산성 킬러 3위 (3,500명 설문) | Atlassian DevEx Report |
| METR 2025 | AI 도구 사용 시 숙련 개발자 완료 시간 19% 증가 — 에이전트 도입만으로 충분하지 않음, 관리 인터페이스가 필요함을 시사 | [arxiv.org/abs/2507.09089](https://arxiv.org/abs/2507.09089) |
| 멀티태스킹 | 2개 작업 동시 = 태스크당 40% 생산성 | 소프트웨어 개발 연구 |
| 인터럽트 효과 | 방해받은 작업 = 2배 시간, 2배 오류율 | ResearchGate |
| Obsidian + Claude | 개발자 마크다운 + AI 조합이 2025년 급성장 | xda-developers, DEV Community |

### 기술 근거

| 항목 | 위치 |
|------|------|
| 기존 패널 시스템 | `naia-os/shell/src/lib/panel-registry.ts` |
| Tauri fs-watch | `tauri-apps/tauri-plugin-fs-watch` |
| Rust notify 크레이트 | `notify-rs/notify` |
| WorkspaceCenterPanel (현재 플레이스홀더) | `naia-os/shell/src/panels/workspace/WorkspaceCenterPanel.tsx` |
| 기존 IDD progress.json 구조 | `naia-os/AGENTS.md` → Progress File 섹션 |

---

## 9. 페이즈 설계

### 원칙

- 각 페이즈는 독립적으로 테스트 가능한 경계에서 분리
- 앞 페이즈 없이 뒷 페이즈 시작 불가
- 각 페이즈 완료 = 동작하는 소프트웨어 (플레이스홀더 아님)

### Phase 1: 파일 탐색기 + 기본 에디터

**목표**: dev 디렉토리를 트리로 보고, 파일을 에디터에서 읽을 수 있다.

- Tauri 명령: `workspace_list_dirs`, `workspace_read_file`, `workspace_write_file`
- React: `FileTree` 컴포넌트 (접기/펼치기)
- React: `Editor` 컴포넌트 (CodeMirror 6, 코드 + 마크다운 하이라이팅)
- 레이아웃: C형 (좌측 탐색기 고정 / 우측 에디터)

**검증**: 탐색기에서 파일 클릭 → 에디터에 표시. Ctrl+S 저장.

### Phase 2: 세션 대시보드 (파일 감시)

**목표**: 활성 세션 디렉토리를 감지하고 실시간으로 카드로 표시한다.

- Tauri: `notify` 또는 `tauri-plugin-fs-watch`로 파일 변경 감지
- Tauri: `workspace_get_git_info` (브랜치명)
- Tauri: `workspace_get_sessions` (모니터링 대상 디렉토리 목록)
- Tauri: `workspace_get_progress` — `.agents/progress/*.json` 읽기 → 이슈/단계 파싱
- React: `SessionCard` 컴포넌트 (상태 배지, 최근 파일, 이슈/단계, 시각)
- React: `SessionDashboard` 그리드 (우측 상단)
- App.tsx: 패널 전환 effect에 `onActivate/onDeactivate` 호출 추가 (공통 패널 규칙 확장 — 현재 미구현)

**검증**: 외부 터미널에서 파일 수정 → 1초 이내 카드 상태 업데이트. 세션 카드에 progress.json 기반 이슈 번호 + 단계 표시.

### Phase 3: 세션 연동 + Naia 컨텍스트

**목표**: 카드 클릭 → 에디터에 해당 파일 표시. Naia가 세션 상태를 인지한다.

- 세션 카드 클릭 → 최근 변경 파일 에디터 오픈
- `NaiaContextBridge.pushContext()` 세션 상태 주입
- `naia.onToolCall("skill_workspace_get_sessions")` 핸들러 등록
- `naia.onToolCall("skill_workspace_open_file")` 핸들러 등록
- 세션 대기 감지 → Naia 토스트 알림

**검증**: "naia-os 세션 뭐해?" 물으면 Naia가 현재 파일/단계 기반으로 답변. `skill_workspace_get_sessions` 직접 호출 시 세션 목록 반환.

### Phase 4: 디렉토리 분류 + 마크다운 프리뷰

**목표**: Naia가 dev 구조를 분류 추천하고, 마크다운 렌더링 뷰를 제공한다.

- `naia.onToolCall("skill_workspace_classify_dirs")` 핸들러 등록 + WORKSPACE_TOOLS에 추가
- 탐색기: 분류별 섹션 표시 (메인/워크트리/참조/문서)
- 에디터: 마크다운 렌더링 프리뷰 전환 버튼
- 분류 설정 저장 (config.ts)

**검증**: 첫 실행 시 Naia 분류 추천 → 사용자 확인 → 탐색기에 섹션 표시.

---

## 10. 멀티터미널 설계 (#115)

> 관련 이슈: [#115](https://github.com/nextain/naia-os/issues/115)
> 작성일: 2026-03-22 · 상태: 설계 완료, 구현 서브이슈로 분리

### 10.1 배경 및 목표

현재 워크스페이스 패널은 세션을 **모니터링**할 수 있지만 Naia가 세션을 직접 **시작·제어**하는 것은 불가능하다. 이 섹션은 Naia가 상위 에이전트로서 서브에이전트 세션을 관리하는 아키텍처를 정의한다.

**핵심 목표**:
- Naia가 `claude`/`codex` 프로세스를 지정 디렉토리에서 직접 시작
- Naia가 실행 중인 세션에 명령을 주입 (방향 수정, 작업 지시)
- 같은 레포의 워크트리들을 한 그룹으로 묶어 표시 (세션 개수 증가 대응)

### 10.2 아키텍처 개요

```
Naia Shell (React + Tauri WebView)
  │
  ├── skill_workspace_new_session
  │     └─→ [Rust] std::process::Command
  │               └─→ claude/codex 프로세스 스폰 (지정 dir)
  │                   WorkspaceWatcher가 파일 변경 감지 → 자동으로 세션 목록에 등장
  │
  ├── skill_workspace_send_to_session
  │     └─→ [Rust] PTY master write (portable-pty crate)
  │               └─→ 실행 중인 세션의 stdin에 텍스트 주입
  │
  └── SessionDashboard (React)
        └─→ Git worktree 그룹핑
              git worktree list --porcelain
              → origin 경로 기준으로 카드 그룹화
```

### 10.3 PTY 통합 아키텍처

**Rust crate**: `portable-pty` (crossterm 기반, Linux/macOS/Windows 지원)

**Tauri IPC 커맨드**:

| 커맨드 | 설명 |
|--------|------|
| `pty_create(dir, command)` | PTY 생성 + 프로세스 스폰, `pty_id` 반환 |
| `pty_write(pty_id, text)` | PTY master에 텍스트 쓰기 |
| `pty_read_stream(pty_id)` | PTY 출력 스트리밍 (Tauri Event) |
| `pty_resize(pty_id, cols, rows)` | 터미널 크기 조정 |
| `pty_kill(pty_id)` | PTY 프로세스 종료 |

**Tauri State 구조**:
```rust
// src-tauri/src/pty.rs
pub struct PtyRegistry {
    handles: Mutex<HashMap<String, PtyHandle>>,
}

pub struct PtyHandle {
    pub pty_id: String,
    pub pid: u32,
    pub dir: String,
    pub master: Box<dyn MasterPty + Send>,
}
```

**Frontend**: `@xterm/xterm` + `@xterm/addon-fit`
PTY 출력은 Tauri Event(`pty:output:{pty_id}`)로 스트리밍, xterm.js가 렌더링.

**`skill_workspace_new_session`의 두 가지 구현 경로**:
- **경로 A (PTY 없이)**: `std::process::Command::new("claude").current_dir(dir)` — 단순 스폰, 터미널 임베드 불가. 세션은 WorkspaceWatcher가 자동 감지.
- **경로 B (PTY 포함)**: `pty_create` 후 스폰 — 터미널 출력을 xterm.js로 표시 가능.

경로 A가 선행 구현 (#119의 일부로 먼저 머지 가능), 경로 B는 PTY 인프라 완성 후 적용.

> **제약**:
> - 경로 A에서 `initial_prompt`는 지원하지 않는다 (PTY stdin 접근 불가, 파라미터 전달 시 무시됨).
> - 경로 A (PTY 없음)로 스폰된 세션에는 `skill_workspace_send_to_session`이 동작하지 않는다. send_to_session은 PTY(경로 B)로 시작된 세션에만 적용 가능. 이 갭은 #119 (PTY 인프라) 완성 전 `skill_workspace_new_session`의 known limitation이다.

### 10.4 도구 인터페이스

#### `skill_workspace_new_session`

```json
{
  "name": "skill_workspace_new_session",
  "tier": 1,
  "parameters": {
    "dir": {
      "type": "string",
      "description": "새 세션을 시작할 디렉토리 절대 경로"
    },
    "command": {
      "type": "string",
      "enum": ["claude", "codex"],
      "description": "실행할 에이전트 커맨드 (기본: claude)"
    },
    "initial_prompt": {
      "type": "string",
      "description": "선택적. 세션 시작 직후 PTY에 주입할 초기 지시사항"
    }
  },
  "required": ["dir"]
}
```

**성공 반환**: `"Started: {dir}, pid: {pid}"`
**에러**: `"Error: directory not found: {dir}"` / `"Error: command not found: {command}"`

**동작**:
1. `dir` 유효성 확인 (절대경로 + 존재 여부)
2. `command` 실행 (`claude` 기본값)
3. `initial_prompt` 있으면 PTY 준비 후 주입 (500ms 지연) — **경로 B(PTY) 전용, 경로 A에서는 무시됨**
4. WorkspaceWatcher가 파일 변경 감지 → 세션이 자동으로 대시보드에 등장

#### `skill_workspace_send_to_session`

```json
{
  "name": "skill_workspace_send_to_session",
  "tier": 2,
  "parameters": {
    "dir": {
      "type": "string",
      "description": "세션의 dir 식별자 (skill_workspace_get_sessions의 sessions[].dir)"
    },
    "text": {
      "type": "string",
      "description": "PTY stdin에 보낼 텍스트 (엔터 포함 시 줄바꿈 문자 직접 포함)"
    }
  },
  "required": ["dir", "text"]
}
```

**제약**: `skill_workspace_new_session`으로 시작된 PTY 세션에만 동작. 외부 터미널 세션에는 stdin 접근 불가.
**성공 반환**: `"Sent to: {dir}"`
**에러**: `"Error: no PTY session for: {dir}"` / `"Error: session not found: {dir}"`

### 10.5 Git worktree 그룹핑

**문제**: 워크트리가 3개 이상이면 세션 카드가 분산되어 어느 게 같은 레포인지 파악이 어렵다.

**데이터 소스**: `git worktree list --porcelain` 파싱

```
worktree /var/home/luke/dev/naia-os
HEAD abc123
branch refs/heads/main

worktree /var/home/luke/dev/naia-os-issue-117
HEAD def456
branch refs/heads/issue-117-focus-session

worktree /var/home/luke/dev/naia-os-issue-115
HEAD ghi789
branch refs/heads/issue-115-multi-terminal
```

→ `mainWorktree = /var/home/luke/dev/naia-os` 기준으로 그룹핑

**Rust `SessionInfo` 확장**:
```rust
pub struct SessionInfo {
    // 기존 필드
    pub dir: String,
    pub path: String,
    pub status: String,
    pub recent_file: Option<String>,
    pub progress: Option<ProgressInfo>,
    // 신규 필드
    pub origin_path: Option<String>,  // 메인 워크트리 절대경로 (worktree면 Some)
    pub branch: Option<String>,       // git 브랜치명
}
```

**UI 변경 (SessionDashboard)**:

```
naia-os/                          ← 접을 수 있는 그룹 헤더
  ├── main          [⚫ 중단]
  ├── issue-117     [🟢 활성]  #117 · Review · stt/registry.ts
  └── issue-115     [🟡 대기]  2분 전

naia.nextain.io/                  ← 워크트리 없으면 단독 카드
  └── main          [🟡 대기]  5분 전

vllm/
  └── main          [⚫ 중단]
```

그룹은 기본 펼침. 그룹 클릭으로 접기/펼치기.

### 10.6 서브이슈 로드맵

| 서브이슈 | 구성 | 의존성 | 우선순위 |
|---------|------|--------|---------|
| `#115-a` (#119): PTY 인프라 + `skill_workspace_new_session` | `portable-pty` crate + Tauri IPC (`pty_create`/`write`/`kill`) + xterm.js + spawn tool (경로 A 먼저, 경로 B는 PTY 완성 후) | 없음 | P1 |
| `#115-b` (#120): `skill_workspace_send_to_session` | PTY stdin inject + tier 2 권한 | #115-a (PTY 인프라, 경로 B 필요) | P1 |
| `#115-c` (#121): Git worktree 그룹핑 | `SessionInfo.origin_path`/`branch` (Rust 백엔드 확장) + `SessionDashboard` 그룹 UI | 없음 (독립) | P2 |

**구현 권장 순서**: #115-c → #115-a (경로 A) → #115-a (경로 B, PTY) → #115-b

> 우선순위(P1/P2)는 비즈니스 중요도 기준. 구현 순서는 기술적 의존성 기준으로, 독립 작업인 #115-c를 먼저 시작할 수 있다.
