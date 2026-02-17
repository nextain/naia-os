# Cafelua OS Phase 3: OpenClaw 통합

- **시작일**: 2026-02-17
- **상태**: 🟡 진행 중
- **프로젝트**: cafelua-os
- **담당**: luke + Claude

---

## 현재 상태 요약

| 단계 | 내용 | 상태 | 커밋 |
|---|---|---|---|
| 1 | OpenClaw 인프라 설정 | ✅ 완료 | `ee98168` |
| 2 | Agent ↔ Gateway 연결 | ✅ 완료 | `ee98168` |
| 3 | LLM Function Calling | 🟡 Gemini만 완료 | `85cb670` |
| — | 코드 리뷰 보안 수정 | ✅ 완료 | `3464586` |
| 4 | Shell UI — 도구 표시 + 설정 | 🟡 부분 완료 | 미커밋 |

**테스트**: Agent 68/68, Shell 89/89, Rust 5/5 (**162 total, 전부 통과**)

**다음 할 일**: 커밋 → 단계 4 나머지 (PermissionModal) → 단계 5 전체 통합

---

## 목표

OpenClaw(MoltBot) Gateway를 Cafelua OS 백엔드로 통합하여,
Alpha VRM 아바타를 통해 일반 유저가 OpenClaw의 50+ 스킬, 20+ 채널, 도구 실행 시스템을 쉽게 사용할 수 있게 한다.

## 배경

- OpenClaw = 맥미니 기반 파워유저 CLI AI 게이트웨이
- Cafelua OS = 같은 기능을 Bazzite + VRM UI로 일반 유저에게 제공
- Phase 2 완료 (대화, TTS/STT, 감정, 페르소나) → Phase 3은 "Alpha가 실제로 일한다"
- Phase 2 커밋: `e0ee49a`, `06e9747` (Agent 36, Shell 63 = 99 tests)

## 아키텍처

```
Alpha Shell (Tauri 2) → stdio → Agent (Node.js, LLM+TTS)
                                  ↓ WebSocket
                          OpenClaw Gateway (데몬, 도구/스킬/채널)
```

---

## 단계별 체크리스트

### 단계 1: OpenClaw 인프라 설정 ✅

- [x] OpenClaw 설치 가능성 확인 (Node.js 22.21.1, v2026.2.14 빌드)
- [x] systemd 유저 서비스 (`config/files/usr/lib/systemd/user/cafelua-gateway.service`)
- [x] Gateway wrapper 스크립트 (`config/files/usr/bin/cafelua-gateway-wrapper`)
- [x] 설치 스크립트 (`config/scripts/setup-openclaw.sh`)
- [x] Tauri `gateway_health` 명령 (`shell/src-tauri/src/lib.rs`)

### 단계 2: Agent ↔ Gateway 연결 ✅

- [x] WebSocket 클라이언트 (`agent/src/gateway/client.ts`)
- [x] 5개 도구 브릿지 + Tier 3 차단 (`agent/src/gateway/tool-bridge.ts`)
- [x] Gateway 프로토콜 타입 (`agent/src/gateway/types.ts`)
- [x] 프로토콜 확장 — tool_use/tool_result 청크 타입

### 단계 3: LLM Function Calling 🟡

- [x] Gemini function calling (`toGeminiContents`, `functionDeclarations`)
- [x] 도구 정의 → LLM 전달 (`GATEWAY_TOOLS`)
- [x] 도구 호출 루프 (`index.ts` — LLM→tool_use→executeTool→tool_result→재호출, 최대 10회)
- [x] ChatRequest에 `enableTools`/`gatewayUrl`/`gatewayToken`
- [ ] xAI function calling (→ 기술 부채)
- [ ] Anthropic tool use (→ 기술 부채)

### 단계 4: Shell UI 🟡

- [x] ToolActivity 컴포넌트 (도구 실행 인라인 표시 — running/success/error)
- [x] ChatPanel 도구 청크 핸들링 (tool_use/tool_result 렌더링)
- [x] Settings 도구 섹션 (enableTools 체크박스, gatewayUrl, gatewayToken)
- [x] Shell에서 `enableTools`/`gatewayUrl`/`gatewayToken` AgentRequest에 포함
- [x] Zustand store 확장 (streamingToolCalls + 3개 액션)
- [x] i18n 도구명 한국어 번역 (5개 도구 + unknown)
- [x] CSS: 8개 테마 자동 지원, --error 변수 추가
- [ ] PermissionModal 컴포넌트 (도구 실행 승인/거부) — **Phase 3.4 나머지**

---

## 기술 부채 (TODO)

UI 연결 완료 후 순차적으로 해결. 잊지 말 것.

| # | 항목 | 위치 | 심각도 | 비고 |
|---|---|---|---|---|
| 1 | **Gateway 연결 풀/싱글턴** | `index.ts:44-47` | 중 | 매 요청마다 WS 연결/해제 → 재사용으로 개선 |
| 2 | **write_file dirname 구조** | `tool-bridge.ts:185` | 하 | Gateway에 `fs.write` 전용 RPC 생기면 교체 |
| 3 | **xAI function calling** | `xai.ts` | 중 | 현재 시그니처만 호환. tool_calls 지원 추가 |
| 4 | **Anthropic tool use** | `anthropic.ts` | 중 | 현재 시그니처만 호환. tool_use 지원 추가 |

---

## 보안

4레이어 보안 모델:

| 레이어 | 역할 | 설정 |
|---|---|---|
| Bazzite (OS) | immutable rootfs, SELinux | 시스템 파일 보호 |
| OpenClaw Gateway | allowlist + exec approval | `security: "allowlist"`, `ask: "on-miss"` |
| Alpha Shell | 승인 모달 + 도구 on/off | 사용자가 직접 제어 |
| Agent | Tier 3 차단 + shell escape | `rm -rf`, `sudo`, `chmod 777`, `curl\|bash`, null byte |

**수정 이력**: `3464586` — command injection 방지 (`shellEscape()` single-quote, `validatePath()` null byte)

## 업스트림 전략

- `ref-moltbot`은 읽기 전용 서브모듈 (upstream tracking)
- 커스터마이즈는 설정 + 어댑터 레이어(`agent/src/gateway/`)에서만
- 월 1회 또는 major release 시 동기화

---

## 작업 기록

### 2026-02-17

**세션 1** — Phase 3 계획 + 인프라 + Gateway 클라이언트:
- OpenClaw(ref-moltbot) 분석, 아키텍처 결정, 업스트림 전략 수립
- CHECK: Node.js 22.21.1, OpenClaw 빌드/Gateway 시작 확인
- 인프라 구현: systemd 서비스, wrapper, 설치 스크립트, Tauri 명령
- Gateway WebSocket 클라이언트 + 도구 브릿지 (TDD, 18개 테스트)
- 커밋: `ee98168` (104 tests)

**세션 2** — Function calling + 보안 수정:
- Gemini function calling 지원 (toGeminiContents, functionDeclarations)
- 도구 호출 루프 (index.ts — max 10 iterations, abort 지원)
- 프로토콜 확장 (tool_use/tool_result 청크, ChatMessage 타입)
- 커밋: `85cb670` (131 tests)
- 코드 리뷰 → command injection 수정 (shellEscape, validatePath)
- ToolDefinition 중복 제거, FunctionCallingConfigMode enum, Shell AgentRequest 동기화
- 커밋: `3464586` (136 tests)

**세션 3** — Shell UI 도구 표시 + 설정 (단계 4 부분):

*구현 (TDD):*
- ToolCall 타입 + ChatMessage 확장 (`types.ts`)
- Zustand store: `streamingToolCalls` + `addStreamingToolUse` + `updateStreamingToolResult` (`chat.ts`)
- ToolActivity 컴포넌트 — 인라인 도구 표시, 접기/펼치기, 상태 아이콘 (`ToolActivity.tsx`)
- ChatPanel: tool_use/tool_result 청크 핸들링 + ToolActivity 렌더링
- chat-service: enableTools/gatewayUrl/gatewayToken 전달
- Config 확장: enableTools, gatewayUrl, gatewayToken
- Settings: "도구 (Tools)" 섹션 추가 (SettingsModal.tsx)
- CSS: .tool-activity 스타일, 8개 테마 지원, --error 변수 4개 추가
- i18n: 도구명 한국어 번역 10개 키 추가

*코드 리뷰 3회전:*
1. 1차 리뷰 → CRITICAL 5건 + MEDIUM 9건 발견
   - CR-1: usage/finish race condition (분석 후 안전 확인)
   - CR-2: invoke() 실패 시 listener 누수 → try/catch 추가
   - CR-3: 응답 없을 때 listener 영구 잔류 → 120s 타임아웃 추가
   - CR-4: render 경로에서 raw localStorage → loadConfig() 교체
   - CR-5: addCostEntry 침묵 실패 → Logger.warn 추가
2. 2차 리뷰 → CRITICAL 5건 + MEDIUM 3건 수정 확인
3. 3차 리뷰 → SHOULD FIX 3건 발견+수정
   - SF-1: enableTools false 저장 시 누락 → 수정
   - SF-2: toolCallId 중복 처리 → dedup 추가
   - SF-3: 미등록 toolCallId 무시 → Logger.warn 추가

*검증:*
- Shell 테스트: 89/89 통과 (기존 63 → +26 신규)
- TSC: 깨끗 (pre-existing 3건도 수정 — 미사용 import/변수)
- Biome: 깨끗
- Vite build: 성공
- **Tauri build: 성공** (`cargo tauri build`)
- **앱 실행 확인**: 창 떠서 agent-core 연결 확인

*교훈:*
- 개발 프로세스(PLAN→CHECK→BUILD→VERIFY→CLEAN→COMMIT) 처음에 건너뜀
  → 유저가 2회 지적 → 코드 리뷰 + E2E 추가
- Gateway 서버(`gateway/`)는 아직 미구현 (Phase 4) — 클라이언트(`agent/src/gateway/`)만 존재
- PermissionModal은 스코프 아웃 — Phase 3.4 나머지로 연기

*테스트 현황*: Agent 68/68, **Shell 89/89**, Rust 5/5 = **162 total**
*미커밋 — 커밋 전 사용자 확인 필요*
