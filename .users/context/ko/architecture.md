# Naia 하이브리드 아키텍처

## 핵심 설계 철학

> **처음부터 만들지 않는다. 검증된 3개 생태계를 조합한다.**

Naia는 3개의 모체 프로젝트에서 각각의 강점을 가져와 조합하는 **하이브리드** 방식:

| 모체 | 역할 | 가져오는 것 |
|------|------|------------|
| **OpenClaw** | 런타임 백엔드 | Gateway 데몬, 명령 실행, 채널, 스킬, 메모리 |
| **project-careti** | 에이전트 지능 | 멀티 LLM, 도구 정의, Alpha 페르소나, 비용 추적 |
| **OpenCode** | 아키텍처 패턴 | 클라이언트/서버 분리, 프로바이더 추상화 |

---

## 왜 하이브리드인가?

### 하나만 쓰면 안 되는 이유

**OpenClaw만?** → CLI 전용, 아바타 없음, Claude Code에 종속, 멀티 LLM 미지원
**Careti만?** → VS Code 확장, always-on 불가, 채널/스킬 없음
**OpenCode만?** → TUI 전용, Gateway/데몬 없음, 채널 없음

### 하이브리드 해법

```
OpenClaw의 데몬+실행+채널+스킬 생태계 (런타임 백엔드)
+ Careti의 멀티 LLM+도구+페르소나 (에이전트 지능)
+ OpenCode의 클라이언트/서버 분리 패턴 (아키텍처)
= Tauri 데스크톱 셸 + VRM 아바타로 포장 (접근성)
```

---

## 런타임 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Naia Shell (Tauri 2 + React + Three.js VRM Avatar) │
│  역할: 데스크톱 UI, 아바타 렌더링, 채팅 패널           │
│  출처: Naia 자체 + AIRI (VRM) + shadcn/ui            │
└──────────────────────┬──────────────────────────────────┘
                       │ stdio JSON lines
┌──────────────────────▼──────────────────────────────────┐
│  Naia Agent (Node.js)                                │
│  역할: LLM 연결, 도구 오케스트레이션, Alpha 페르소나    │
│  출처: Careti 프로바이더 + OpenCode 패턴                │
│  기능: 멀티 LLM, TTS, 감정, 비용 추적                  │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (ws://127.0.0.1:18789)
┌──────────────────────▼──────────────────────────────────┐
│  OpenClaw Gateway (systemd user service)                │
│  역할: 명령 실행, 보안, 채널, 스킬, 메모리             │
│  출처: OpenClaw 생태계 (npm: openclaw)                  │
│  인증: 디바이스 ID + 토큰 스코프 (protocol v3)          │
│  메서드: 프로파일별 동적 노출 (agent, node.invoke,      │
│  sessions, browser.request, skills, channels 등)         │
└─────────────────────────────────────────────────────────┘
```

## 3대 축 상세

### 축 1: OpenClaw (런타임 백엔드)

OpenClaw이 제공하는 것:
- **Gateway 데몬**: systemd 유저 서비스, 항상 실행
- **명령 실행**: exec.bash 우선 + node.invoke(system.run) 폴백
- **보안**: 디바이스 인증, 토큰 스코프, exec approval
- **채널**: Discord, Telegram, WhatsApp, Slack, IRC 등
- **스킬**: 50+ 내장 (날씨, 시간, 메모 등)
- **메모리**: 대화 영속, 컨텍스트 리콜
- **세션**: 멀티 세션, sub-agent spawn
- **ACP**: Agent Control Protocol (클라이언트↔에이전트 브릿지)
- **TTS**: 통합 프로바이더 셀렉터 (Edge TTS 무료, Google Cloud, OpenAI, ElevenLabs) — 직접 API 호출

### 축 2: project-careti (에이전트 지능)

Careti가 제공하는 것:
- **멀티 LLM**: Gemini (기본), xAI (Grok), Claude
- **도구 정의**: GATEWAY_TOOLS (8개 도구)
- **Function calling**: Gemini 네이티브 (xAI/Claude = 기술 부채)
- **Alpha 페르소나**: 시스템 프롬프트, 감정 매핑
- **비용 추적**: 요청별 비용 표시
- **stdio 프로토콜**: Shell ↔ Agent JSON lines

### 축 3: OpenCode (아키텍처 패턴)

OpenCode가 제공하는 것:
- **클라이언트/서버 분리**: Shell (클라이언트) / Agent (서버)
- **프로바이더 추상화**: buildProvider 팩토리 패턴
- **모듈 경계**: shell / agent / gateway 분리

---

## Shell UI 레이아웃

```
App
├── TitleBar (패널 토글 버튼 + 창 컨트롤)
└── .app-layout [data-panel-position="left"|"right"|"bottom"]
    ├── .side-panel (ChatPanel — panelVisible=true일 때만 렌더링)
    └── .main-area (AvatarCanvas — 항상 표시)
```

- **panelPosition**: `"left" | "right" | "bottom"` — CSS flex-direction으로 패널 위치 제어
- **panelVisible**: `boolean` — 채팅 패널 토글; 아바타는 항상 표시
- **panelSize**: `number (0-100)` — 채팅 패널이 뷰포트에서 차지하는 비율. 기본값: **70**
- **아바타 리사이즈**: `ResizeObserver`로 컨테이너 크기 변경 감지 (window resize 아님)
- **설정 동기화**: panelPosition + panelVisible + panelSize + liveVoice + liveModel + voiceConversation은 Lab에 동기화 (`LAB_SYNC_FIELDS`)

---

## 데이터 흐름

| 시나리오 | 흐름 |
|---------|------|
| **채팅** | User → Shell → Agent → LLM → Agent → Shell → User |
| **도구 실행** | LLM → Agent (tool_use) → Gateway (exec.bash 또는 node.invoke) → OS → result → LLM |
| **승인** | Gateway → Agent (approval_request) → Shell (모달) → 사용자 결정 → Agent → Gateway |
| **외부 채널** | Discord msg → Gateway → Agent → LLM → Agent → Gateway → Discord reply |

## 자격 증명 저장소 아키텍처

> 최종 업데이트: 2026-03-05

### naiaKey 이중 저장소 (localStorage + Tauri 보안 저장소)

`naiaKey` (Naia Lab API 키)는 안정성을 위해 **두 곳**에 저장된다:

| 저장소 | 특성 | 사용처 |
|--------|------|--------|
| **localStorage** | 동기, 빠름 | 모든 UI 컴포넌트 (`saveConfig`/`loadConfig`) |
| **Tauri 보안 저장소** | 비동기, 암호화 | 브라우저 스토리지 초기화 시에도 유지 |

**쓰기 지점:**
- **로그인** (SettingsTab/OnboardingWizard): `saveConfig({naiaKey})` + `saveSecretKey("naiaKey", key)`
- **저장** (SettingsTab): `saveConfig()` + `void saveSecretKey()`
- **로그아웃** (SettingsTab): `saveConfig({naiaKey: undefined})` + `deleteSecretKey("naiaKey")`

**읽기 병합** (`loadConfigWithSecrets()`):
1. localStorage 값 읽기 (동기)
2. 보안 저장소 값 읽기 (비동기)
3. **localStorage 우선** — 다르면 보안 저장소에 동기화
4. 보안 저장소에만 값이 있으면 → 사용 (마이그레이션/복구 케이스)

### naiaKey의 LLM 프로바이더 독립성

`naiaKey`는 `ChatRequest`에서 `provider` 설정과 별도의 **최상위 필드**로 전달된다. 이를 통해 LLM 프로바이더가 gemini/openai/xai/anthropic으로 설정되어 있어도 Naia Cloud TTS가 동작한다.

- ChatPanel은 `naiaKey`를 `provider.naiaKey` (LLM용)와 요청 수준 `naiaKey` (TTS용) 양쪽에 전달
- Agent 해석: `effectiveNaiaKey = request.naiaKey || provider.naiaKey`

**핵심 파일:** `config.ts`, `secure-store.ts`, `SettingsTab.tsx`, `OnboardingWizard.tsx`, `agent/src/index.ts`, `agent/src/protocol.ts`

---

## 데스크톱 아바타 로컬 파일 파이프라인

VRM/배경을 로컬 파일에서 안정적으로 로드하기 위한 규칙:

- `file://` 경로는 저장/렌더 전에 절대 경로로 정규화한다.
- 경로가 `http://localhost/...` 형태로 들어오면 Tauri 자산 프로토콜 호환을 위해 `http://asset.localhost/...`로 변환한다.
- 절대 로컬 VRM은 Rust 커맨드 `read_local_binary`로 바이트를 읽고, 프론트엔드에서 `ArrayBuffer`로 직접 parse한다.
  URL fetch 방식의 CORS/접근 제어 실패를 피하기 위함.
- 배경 이미지는 자산 URL 변환을 사용하고, 실패 시 기본 그라데이션 배경으로 폴백한다.

### E2E 실행 주의

- `e2e-tauri`는 `src-tauri/target/debug/naia-shell` 고정 바이너리를 실행한다 (`pnpm build` 산출물과 별개).
- Rust `#[tauri::command]` 또는 `invoke_handler` 변경 후에는 E2E 전에 반드시 `src-tauri`에서 `cargo build`를 실행한다.

### Agent 빌드 파이프라인 주의

Agent는 `shell/src-tauri/target/debug/agent/dist/index.js`에서 실행된다 (사전 빌드). **Vite HMR은 agent 코드에 적용되지 않는다.** `agent/src/` 수정 후:
1. `cd agent && pnpm build` (tsc가 `agent/dist/`로 컴파일)
2. `cp -r agent/dist/ shell/src-tauri/target/debug/agent/dist/`
3. 또는 `pnpm run tauri dev` 재시작 (자동 재빌드)

## 채널/온보딩 Discord 라우팅 규칙

- Discord 봇 추가 플로우는 Shell에서 직접 토큰/웹훅을 다루지 않고 `naia.nextain.io` 라우팅을 사용한다.
- Channels 탭의 Discord 로그인 버튼과 온보딩 마지막 단계 선택 버튼은 모두 아래 경로를 연다.
  `https://naia.nextain.io/ko/discord/connect?source=naia-shell`
- 보안 원칙:
  - `DISCORD_BOT_TOKEN`은 shell 프론트엔드에서 사용/노출하지 않는다.
  - 봇 비밀키는 `naia.nextain.io` 서버 환경변수에서만 관리한다.

## 딥링크 저장 계약 (중요)

OAuth 딥링크 페이로드는 특정 탭(설정/온보딩) 렌더 여부와 무관하게 반드시 저장되어야 한다.

- 필수 규칙:
  - 런타임 동작에 영향 주는 딥링크 이벤트(`discord_auth_complete` 등)는 **항상 마운트된 계층(App 루트)** 에서 수신/저장한다.
  - Settings/Onboarding 리스너는 UI 상태 동기화 용도로만 쓰고, 저장 로직은 공통 라이브러리로 단일화한다.
  - Agent 기본 전송 타깃 결정은 "설정 탭이 열려 있었는지"에 의존하면 안 된다.
- 금지 패턴:
  - 탭 컴포넌트 내부에서만 인증 페이로드를 저장하는 구조
  - 컴포넌트별로 서로 다른 fallback 규칙을 중복 구현하는 구조

## 메모리 아키텍처 (듀얼 오리진)

메모리는 **두 시스템**에 나뉘어 있으며, 세션 경계에서 연결된다.

- **Shell**이 "사용자가 누구인지" (facts)를 소유
- **OpenClaw**가 "무슨 일이 있었는지" (세션 트랜스크립트 + 시맨틱 검색 인덱스)를 소유

### Shell 메모리 (Tauri)

#### 단기기억 (Short-Term Memory)

| 항목 | 내용 |
|------|------|
| **저장소** | Zustand (인메모리) + SQLite messages 테이블 |
| **범위** | 현재 세션 전체 메시지 |
| **수명** | 현재 세션 ~ 최근 7일 |
| **구현** | Rust `memory.rs` + Frontend `db.ts` + Chat store |

#### 장기기억 — Facts

| 항목 | 내용 |
|------|------|
| **저장소** | `~/.config/naia-os/memory.db` (SQLite, facts 테이블) |
| **범위** | 세션 간 사용자 지식 (이름, 생일, 선호, 결정사항) |
| **추출** | `memory-processor.ts` `extractFacts()` — LLM이 대화를 파싱 → `{key, value}[]` |
| **주입** | `persona.ts` `buildSystemPrompt()` → `"Known facts about the user: ..."` 시스템 프롬프트에 삽입 |

### OpenClaw 메모리 (데몬)

#### 세션 트랜스크립트

| 항목 | 내용 |
|------|------|
| **저장소** | `~/.openclaw/agents/main/sessions/` (`sessions.json` + 세션별 `*.jsonl`) |
| **범위** | 세션 키별 전체 대화 이력 (`agent:main:main`, `discord:dm:*` 등) |
| **RPC** | `sessions.list`, `chat.history`, `sessions.transcript`, `sessions.compact` |
| **Hook** | `session-memory` — `/new` 또는 `/reset` 시 대화를 `workspace/memory/*.md`로 저장 |

#### 시맨틱 검색 인덱스

| 항목 | 내용 |
|------|------|
| **저장소** | `~/.openclaw/memory/main.sqlite` (SQLite, 임베딩 포함) |
| **도구** | `memory_search` (시맨틱 검색), `memory_get` (항목 조회) |
| **범위** | 세션 간 검색 가능한 인덱스 (세션 + `workspace/memory/*.md` 파일) |

#### 워크스페이스 부트스트랩 파일

| 항목 | 내용 |
|------|------|
| **저장소** | `~/.openclaw/workspace/` (`SOUL.md`, `IDENTITY.md`, `USER.md`) |
| **동기화** | Shell이 설정 변경 시 `sync_openclaw_config` (`lib.rs`)로 기록 |
| **참고** | Shell 설정에서 재생성 가능 — 원본 데이터 아님 |

### 데이터 흐름 (두 시스템의 연결)

```
세션 시작
  Shell: buildMemoryContext() → Shell DB에서 getAllFacts()
  Shell: buildSystemPrompt(persona, {facts, userName, locale, ...})
  → 사용자 facts가 포함된 시스템 프롬프트를 Agent에 전달

세션 진행 중
  Agent ↔ OpenClaw: 메시지가 세션 트랜스크립트(*.jsonl)에 저장
  OpenClaw: memory_search 도구로 LLM이 과거 세션 검색 가능
  Shell: Zustand store가 UI용 현재 메시지 보관

세션 종료 (사용자가 "새 대화" 클릭)
  Shell [fire-and-forget]:
    1. summarizeSession(messages) → LLM이 2-3문장 요약 생성
    2. patchGatewaySession("agent:main:main", {summary}) → OpenClaw 세션 메타데이터
    3. extractFacts(messages, summary) → LLM이 {key, value}[] 사용자 facts 추출
    4. upsertFact() × N → Shell facts DB (memory.db)
  OpenClaw:
    session-memory hook이 대화를 workspace/memory/YYYY-MM-DD-slug.md로 저장
    시맨틱 인덱스에 새 세션 내용 업데이트

다음 세션
  Shell: facts 로드 → 시스템 프롬프트에 주입 ("Known facts about the user")
  OpenClaw: memory_search로 이전 세션 내용 검색 가능
  → 사용자는 시스템 프롬프트 facts + 검색 가능한 이력 양쪽으로 "기억"됨
```

### Discord 채널 메모리

Discord 메시지는 OpenClaw 세션(`agent:main:discord:direct:<userId>`)을 통해 흐른다.
OpenClaw 세션 트랜스크립트에 저장되고 `memory_search`로 검색 가능.
다만 Shell fact 추출(`summarizePreviousSession`)은 Shell 채팅 세션에서만 실행 —
**Discord 대화에서는 아직 fact 추출이 트리거되지 않음**.

### 기기 변경 시 백업 가이드

| 경로 | 내용 | 필수? |
|------|------|-------|
| `~/.config/naia-os/memory.db` | Shell facts (사용자 지식) | **필수** |
| `~/.openclaw/memory/main.sqlite` | 시맨틱 검색 인덱스 | **필수** (재구축 가능하나 느림) |
| `~/.openclaw/agents/main/sessions/` | 대화 트랜스크립트 | 권장 |
| `~/.openclaw/openclaw.json` | Gateway 설정 (API 키, 모델) | 권장 |
| `~/.openclaw/workspace/` | SOUL/IDENTITY/USER.md | Shell에서 재생성 가능 |
| `~/.openclaw/credentials/` | OAuth 토큰 | 재인증 가능 |

### 검색 엔진 진화 (MemoryProcessor 인터페이스로 교체 가능)

```
4.4a: SQLite LIKE (키워드 매칭)
4.4b: SQLite FTS5 BM25 (전문검색)
4.5:  Gemini Embedding API (의미 검색)
5+:   sLLM (Ollama, llama.cpp) 로컬 요약/임베딩
```

### DB 스키마

```sql
-- Shell facts (사용자 지식, 세션 간 영구)
CREATE TABLE facts (id TEXT PK, key TEXT UNIQUE, value TEXT,
                    source_session TEXT, created_at INT, updated_at INT);

-- OpenClaw 세션: ~/.openclaw/agents/main/sessions/sessions.json (메타데이터)
--             + 세션별 *.jsonl (트랜스크립트)
-- OpenClaw 시맨틱: ~/.openclaw/memory/main.sqlite (임베딩 인덱스)
```

---

## 스킬 시스템

스킬 관리: 빌트인 스킬, Gateway 스킬, 설치 흐름. *(업데이트: 2026-03-05)*

### 빌트인 스킬

- **개수**: 20개
- **동기화 위치** (4곳 모두 동일한 20개 나열 필수):
  1. `shell/src-tauri/src/lib.rs` — `list_skills` Tauri 커맨드
  2. `shell/src/components/ChatPanel.tsx` — `BUILTIN_SKILLS` Set (비활성화 방지)
  3. `agent/src/skills/built-in/*.ts` — tool-bridge 레지스트리
  4. `agent/scripts/generate-skill-manifests.ts` — `SKIP_BUILT_IN` 리스트
- **규칙**: 새 빌트인 스킬 추가 시 4곳 모두 업데이트 필요.

### Gateway 스킬

- **소스**: OpenClaw Gateway `skills.status` RPC
- **응답 필드**: `name`, `description`, `eligible`, `missing[]`, `install[]` (`{ id, kind, label }`)
- **설치 종류**: `brew`, `node`, `go`, `uv`, `download`

### 설치 흐름

```
1. Shell SkillsTab에서 fetchGatewayStatus() 호출
   → directToolCall({ action: "gateway_status" })
   → Agent skill_skill_manager → Gateway skills.status RPC
   → skills[] (install[] 배열 포함) 반환

2. 사용자가 Install 버튼 클릭
   → Shell이 gs.install[0].id에서 installId 결정
   → directToolCall({ action: "install", skillName, installId })
   → Agent skill_skill_manager → Gateway skills.install RPC
   → Gateway가 설치 프로그램 실행 (brew/npm/go 등)
   → 성공/에러 반환

3. Shell이 설치 결과 피드백 표시
   → Gateway 상태 재조회하여 UI 업데이트
```

- **RPC 파라미터**: `skills.status: { agentId? }`, `skills.install: { name, installId }` — `installId` 필수 (`install[].id`에서 가져옴)
- **directToolCall 흐름**: Shell → Tauri stdin → Agent `handleToolRequest()` → `executeTool(skill_skill_manager)` → Gateway RPC → Shell로 결과 반환
- **이벤트 정리**: `delegateStreaming` 완료 후 `GatewayClient.offEvent(handler)` 호출 필수 (이벤트 핸들러 메모리 누수 방지).

---

## 보안 4계층 (심층 방어)

| 계층 | 역할 | 설정 |
|------|------|------|
| **OS** | Bazzite immutable rootfs + SELinux | 시스템 파일 보호 |
| **Gateway** | OpenClaw 디바이스 인증 + 토큰 스코프 + exec approval | protocol v3, Ed25519 |
| **Agent** | Permission tiers 0-3 + 도구별 차단 | Tier 3: rm -rf, sudo 등 차단 |
| **Shell** | 사용자 승인 모달 + 도구 on/off 토글 | 사용자가 직접 제어 |

**원칙: 각 계층이 독립적. 한 계층이 뚫려도 나머지가 방어.**

---

## Gateway 연결 프로토콜

Naia Agent가 OpenClaw Gateway에 연결하는 과정:

```
1. WebSocket 연결: ws://127.0.0.1:18789
2. Gateway → connect.challenge 이벤트 (nonce 포함)
3. Agent → connect 요청 (토큰 + protocol v3 + client info)
4. Gateway → hello-ok 응답 (88개 메서드 + 기능 목록)
5. Agent → req/res 프레임으로 도구 실행 (exec.bash / node.invoke 등)
```

### 인증 파라미터

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| auth.token | gateway.auth.token | Gateway 설정의 공유 토큰 |
| client.id | "cli" | 페어링된 디바이스 ID |
| client.platform | "linux" | 플랫폼 |
| client.mode | "cli" | 클라이언트 모드 |
| minProtocol | 3 | 최소 프로토콜 버전 |
| maxProtocol | 3 | 최대 프로토콜 버전 |

---

## 음성 아키텍처

> 최종 업데이트: 2026-03-10

### 개요

Naia는 두 가지 음성 출력 모드를 지원하며, 하나의 음성 설정을 공유한다:

1. **실시간 음성 대화** — 프로바이더 패턴 기반 양방향 실시간 오디오
2. **TTS (텍스트 음성 변환)** — 텍스트 채팅 응답을 소리로 읽어줌

Naia 계정 사용자는 동일한 Chirp 3 HD 음성(예: "Kore")을 양쪽 모두에 사용한다.

### 음성 설정 통합

| 항목 | 값 |
|------|-----|
| 설정 필드 | `liveVoice` |
| 저장 형식 | 짧은 이름 (예: `"Kore"`, `"Puck"`) |
| Live API 사용 | 직접 voice 파라미터로 전달 |
| TTS 사용 | ChatPanel에서 `ko-KR-Chirp3-HD-{liveVoice}` 형식으로 변환 |

**사용 가능한 음성 (Naia/Gemini):**
Kore (여성, 차분), Puck (남성, 활발), Charon (남성, 깊은), Aoede (여성, 밝은), Fenrir (남성, 낮은), Leda (여성, 부드러운), Orus (남성, 단단한), Zephyr (중성), Achernar, Gacrux, Sulafat, Umbriel

비-Naia 프로바이더(google, edge, openai, elevenlabs)는 별도의 `ttsVoice` 필드 사용.

### 실시간 음성 대화 (프로바이더 패턴)

실시간 음성은 텍스트 LLM 프로바이더와 동일한 **프로바이더 기반 아키텍처**를 사용한다.

**타입:** `LiveProviderId = "naia" | "gemini-live" | "openai-realtime"`

**팩토리:** `createVoiceSession(provider, options?) → VoiceSession` (`shell/src/lib/voice/index.ts`)

**설정:** localStorage config의 `liveProvider` 필드, Settings UI에서 선택 가능

#### 프로바이더

| 프로바이더 | 경로 | 인증 | 파일 |
|-----------|------|------|------|
| **naia** | 브라우저 WS → any-llm gateway `/v1/live` → Gemini Live API | naiaKey | `voice/gemini-live.ts` |
| **gemini-live** | Tauri 커맨드 → Rust WS 프록시 (tokio-tungstenite) → Gemini Live API | Google API key | `voice/gemini-live-proxy.ts` + `src-tauri/src/gemini_live.rs` |
| **openai-realtime** | 브라우저 WS → `wss://api.openai.com/v1/realtime` | OpenAI API key | `voice/openai-realtime.ts` |

**Gemini Direct (Rust 프록시):** WebKitGTK가 `wss://generativelanguage.googleapis.com`에 연결할 수 없음 (조용히 행). Rust 프록시(tokio-tungstenite)가 WebSocket을 처리하고 Tauri 이벤트/커맨드로 메시지를 중계한다. Google은 JSON을 Binary WebSocket 프레임으로 전송 — `msg_to_text()`가 Text와 Binary 양쪽을 처리한다.

#### VoiceSession 인터페이스

모든 프로바이더는 통일된 `VoiceSession` 인터페이스를 구현:
- **메서드:** `connect()`, `sendAudio(base64)`, `sendText(text)`, `sendToolResponse(id, result)`, `disconnect()`
- **이벤트:** `onAudio`, `onInputTranscript`, `onOutputTranscript`, `onTurnEnd`, `onInterrupted`, `onToolCall`, `onError`, `onDisconnect`

#### 공유 컴포넌트

| 파일 | 역할 |
|------|------|
| `shell/src/components/ChatPanel.tsx` | UI 상태 (off/connecting/active), 이벤트 연결, 트랜스크립트 누적 |
| `shell/src/lib/voice/types.ts` | 프로바이더 타입, 설정 인터페이스, 음성 옵션 목록 |
| `shell/src/lib/audio-player.ts` | 연속 PCM 재생 (24kHz Int16 mono → AudioContext) |
| `shell/src/lib/mic-stream.ts` | 마이크 캡처, 16kHz PCM 다운샘플, base64 청크 전송 |
| `project-any-llm/.../routes/live.py` | naia 프로바이더용 WebSocket 프록시 (클라이언트 ↔ Gemini Live SDK) |

**핵심 기술 사항:**
- `session.receive()` 이터레이터는 `turnComplete` 후 종료 (SDK 동작) → `while True`로 래핑하여 멀티턴 지원
- 토큰 사용량은 턴마다 `+=`로 누적 (정확한 과금)
- AudioContext는 webkit2gtk에서 자동 suspend → `ctx.resume()` 호출 필요
- 트랜스크립트는 단어 단위로 점진적 도착 → `inputAccum`/`outputAccum`으로 누적 (덮어쓰기 아님)

**모델:** 프로바이더별 `config.liveModel`로 설정 가능 (각 프로바이더에 기본값 있음)

### 프로바이더 레지스트리 패턴

확장 가능한 Map 기반 레지스트리. 모듈 로드 시 자가 등록(self-registration).

**새 TTS 프로바이더 추가 방법:**
1. `agent/src/tts/{name}.ts` 파일 생성
2. `TtsProviderDefinition` 인터페이스 구현 (synthesize + 메타데이터)
3. 모듈 스코프에서 `registerTtsProvider({...})` 호출
4. `agent/src/tts/index.ts`에 import 추가
5. `shell/src/lib/tts/registry.ts`에 `TtsProviderMeta` 추가 (Settings UI용)

**핵심 파일:**
- `agent/src/tts/types.ts` — `TtsProviderDefinition`, `TtsSynthesizeOptions`
- `agent/src/tts/registry.ts` — `registerTtsProvider()`, `synthesize()`, `listTtsProviders()`
- `shell/src/lib/stt/registry.ts` — `SttProviderMeta` (vosk, whisper)
- `shell/src/lib/tts/registry.ts` — `TtsProviderMeta` (edge, google, openai, elevenlabs, nextain)

### TTS (텍스트 음성 변환)

**기본 프로바이더:** `edge` (무료, 로그인 불필요). 프로바이더 레지스트리를 통해 디스패치.

**naiaKey 라우팅:** TTS 인증(`naiaKey`)은 LLM 프로바이더 선택과 독립적이다. `ChatRequest`가 `naiaKey`를 최상위 필드로 전달하므로, LLM이 gemini/openai/xai/anthropic으로 설정되어 있어도 Naia Cloud TTS가 동작한다.

| 프로바이더 | 경로 | 음성 |
|-----------|------|------|
| nextain | ChatPanel → agent → nextain-tts.ts → any-llm gateway → Google Cloud TTS | Chirp 3 HD (liveVoice에서 변환) |
| google | ChatPanel → agent → OpenClaw gateway → Google Cloud TTS | Neural2 시리즈 |
| edge | ChatPanel → agent → OpenClaw gateway → Edge TTS | 무료 |
| openai | ChatPanel → agent → OpenClaw gateway → OpenAI TTS | OpenAI 음성 |
| elevenlabs | ChatPanel → agent → OpenClaw gateway → ElevenLabs | ElevenLabs 음성 |

### 파이프라인 음성 모드 (Pipeline Voice)

LLM 모델(비-옴니)을 위한 음성 대화 모드. Vosk STT → LLM → 문장 단위 TTS → 순차 재생.

**아키텍처:**
```
사용자 음성 → Vosk STT (오프라인) → 인식된 텍스트
→ sendChatMessage (일반 LLM 경로, TTS 비활성화)
→ LLM 텍스트 스트림 → SentenceChunker (문장 경계 감지)
→ 문장별 tts_request → Agent handleTtsRequest → Edge TTS (기본값)
→ MP3 base64 → AudioQueue (순차 재생)
```

**주요 컴포넌트:**
| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| STT | `tauri-plugin-stt` (Vosk) | 오프라인 음성 인식, 언어별 ~50MB 모델 자동 다운로드 |
| SentenceChunker | `shell/src/lib/voice/sentence-chunker.ts` | 한/영 혼합 텍스트 문장 분리 (최소 10자, 최대 120자) |
| AudioQueue | `shell/src/lib/voice/audio-queue.ts` | MP3 순차 재생, 인터럽트, 아바타 speaking 상태 |
| TTS 요청 | `agent/src/index.ts`, `shell/src/lib/chat-service.ts` | 문장별 TTS 합성 요청/응답 |

**상태 흐름:** LISTENING → PROCESSING → SPEAKING → LISTENING
**인터럽트:** 재생 중 사용자 발화 감지 시 AudioQueue 클리어 + LLM 스트림 취소
**디바운스:** 1000ms (다중 발화 병합)
**OpenClaw 분리:** STT/TTS는 독립 처리. OpenClaw는 LLM 라우팅 + 스킬/도구만 담당.

### STT 상태

두 가지 STT 모드:
1. **라이브 음성 프로바이더** (Gemini/OpenAI): 내장 음성 인식 (`inputTranscription`)
2. **파이프라인 음성 모드**: 오프라인 STT (Vosk 또는 Whisper), LLM 모델용

`stt_models.rs`에서 Vosk + Whisper 통합 모델 카탈로그 관리.
설정 UI: STT 프로바이더 선택 + 모델 목록 (용량/WER 표시), 다운로드/삭제 버튼.
첫 설치 시: `sttProvider` 미설정 → 음성 버튼 누르면 팝업 → 설정으로 이동.
설정 필드: `sttProvider` ("vosk"|"whisper"), `sttModel` (model_id 문자열).

**Vosk 모델** (스트리밍, 사용 가능): ko-KR (82MB), en-US (40MB), ja-JP (48MB)
**Whisper 모델** (배치, 사용 가능): tiny (75MB) → large-v3 (3GB). whisper-rs 0.15 (whisper.cpp 바인딩) 사용.
Whisper 추론은 2초 주기 또는 1.5초 무음 감지 시 실행. Vosk와 동일한 이벤트 인터페이스.
빌드 요구사항: cmake (whisper.cpp 컴파일). `.cargo/config.toml`에서 `WHISPER_DONT_GENERATE_BINDINGS=1` 설정으로 bindgen 생략 (libclang 불필요).
`nextain/whisper-rs-fork` 포크 사용, `cuda-dynamic` 피처로 런타임 CUDA 백엔드 로딩 지원.

**CUDA 동적 로딩:** 단일 바이너리로 NVIDIA/비-NVIDIA 시스템 모두 지원.
- 2패스 CMake 빌드: Pass 1 = 정적 CPU-only 바이너리, Pass 2 = `libggml-cuda.so` MODULE
- `.so` 파일이 실행 파일 옆에 있으면 → GPU 가속; 없으면 → CPU-only 폴백 (크래시 없음)
- `ggml_backend_load_all()`: `std::sync::Once`로 첫 WhisperContext 생성 전 호출
- CUDA 툴킷은 빌드 타임에만 필요; 런타임은 dlopen으로 자동 감지
- 포크: `github.com/nextain/whisper-rs-fork`, 업스트림 PR 예정 (`codeberg.org/tazz4843/whisper-rs`)

레거시 STT (`stt.ts`, `audio-recorder.ts`)와 `sttEnabled` 설정 토글은 제거됨.

### 음성 성별 기본값

VRM 아바타 성별에 따라 기본 음성이 자동 설정됨:
- VRM 모델 1,3 (여성) → liveVoice: "Kore", Edge TTS: "ko-KR-SunHiNeural", Google TTS: "ko-KR-Neural2-A"
- VRM 모델 2,4 (남성) → liveVoice: "Puck", Edge TTS: "ko-KR-InJoonNeural", Google TTS: "ko-KR-Neural2-C"
- Naia 로그인 시: Lab에 저장된 liveVoice가 있으면 사용, 없으면 VRM 성별 기반 자동 설정.

### 과금

- **실시간 음성 대화:** 프로바이더별 상이 (Gemini: $0.10/M 입력 + $0.40/M 출력, OpenAI: ~$0.10/분)
- **TTS:** 프로바이더별 상이 (Chirp 3 HD, Neural2, Edge 무료, OpenAI, ElevenLabs)
