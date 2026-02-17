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
| 4 | Shell UI | 🔲 다음 작업 | - |

**테스트**: Agent 68/68, Shell 63/63, Rust 5/5 (**136 total, 전부 통과**)

**다음 할 일**: 단계 4 — Shell UI (ToolProgress, PermissionModal, ChatPanel 도구 핸들링)

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

### 단계 4: Shell UI 🔲

- [ ] ToolProgress 컴포넌트 ("파일을 읽고 있어요..." 상태 표시)
- [ ] PermissionModal 컴포넌트 (도구 실행 승인/거부)
- [ ] ChatPanel 도구 청크 핸들링 (tool_use/tool_result 렌더링)
- [ ] Settings 도구 섹션 (도구 on/off 토글)
- [ ] Shell에서 `enableTools`/`gatewayUrl` AgentRequest에 포함

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
