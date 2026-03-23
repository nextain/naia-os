---
name: verify-send-to-session
description: skill_workspace_send_to_session(#120) 핵심 불변식 검증. tool descriptor 등록, ChatPanel 라우팅 패턴, handler 로직, E2E mock 정확성 확인. send_to_session 관련 파일 변경 후 사용.
---

# verify-send-to-session

skill_workspace_send_to_session (#120) 구현의 핵심 불변식을 검증합니다.

## Workflow

### Step 1: tool descriptor 등록 확인

`skill_workspace_send_to_session`이 `WORKSPACE_TOOLS`에 등록되어 있는지 확인합니다.

```bash
grep -n "skill_workspace_send_to_session" shell/src/panels/workspace/index.tsx
```

**PASS 조건**: `name: "skill_workspace_send_to_session"` 행 존재, `tier: 2` 존재, `required: ["dir", "text"]` 존재.

### Step 2: ChatPanel panel_tool_call 라우팅 패턴 확인

`panel_tool_call` 핸들러가 `activeBridge` 싱글톤 대신 `panelRegistry` + `getBridgeForPanel`로 라우팅하는지 확인합니다.

```bash
grep -n "getBridgeForPanel\|panelRegistry.*list\|ownerPanel" shell/src/components/ChatPanel.tsx
```

**PASS 조건**: `getBridgeForPanel` import 존재, `panelRegistry.list().find(` 존재, `getBridgeForPanel(ownerPanel.id)` 존재.

### Step 3: messageQueue stale closure 패턴 확인

`useEffect` 큐 처리에서 `handleSend(next)` 직접 호출 패턴을 사용하는지 확인합니다 (stale closure 방지).

```bash
grep -n "handleSend\|dequeueMessage\|setInput.*next" shell/src/components/ChatPanel.tsx | grep -A3 -B3 "dequeueMessage"
```

**PASS 조건**: `handleSend(next)` 존재. `setTimeout.*handleSend` + `setInput(next)` 조합이 없어야 함.

### Step 4: WorkspaceCenterPanel handler 등록 확인

`skill_workspace_send_to_session` handler가 `naia.onToolCall`로 등록되어 있는지 확인합니다.

```bash
grep -n "skill_workspace_send_to_session\|pty_write" shell/src/panels/workspace/WorkspaceCenterPanel.tsx
```

**PASS 조건**: `naia.onToolCall("skill_workspace_send_to_session",` 존재, `invoke("pty_write",` 존재, `terminalsRef.current.find((t) => t.dir === dir)` 존재.

### Step 5: E2E mock 정확성 확인

120 E2E spec의 mock이 `JSON.stringify(SEND_TEXT)`로 올바르게 이스케이프하는지 확인합니다 (template literal 개행 버그 방지).

```bash
grep -n "SEND_TEXT\|JSON.stringify" shell/e2e/120-send-to-session.spec.ts
```

**PASS 조건**: `${JSON.stringify(SEND_TEXT)}` 존재. `"${SEND_TEXT}"` (따옴표 포함) 패턴이 없어야 함 (개행 버그).

### Step 6: 119 E2E mock workspace_set_root 확인

119 spec에 `workspace_set_root` mock이 있는지 확인합니다 (workspaceReady gate 대응).

```bash
grep -n "workspace_set_root" shell/e2e/119-pty-terminal.spec.ts
```

**PASS 조건**: `if (cmd === "workspace_set_root") return` 존재.

## Exceptions

- `activeBridge` import 자체는 정상 — fallback으로 사용됨
- `setInput("")` in `handleSend` 본체는 정상 — `overrideText` 경로에서도 input 초기화 필요
- `pty_write` Rust 구현은 검증 범위 외 (shell/src-tauri/src/pty.rs)

## Related Files

| File | Purpose |
|------|---------|
| `shell/src/panels/workspace/index.tsx` | tool descriptor (WORKSPACE_TOOLS) |
| `shell/src/components/ChatPanel.tsx` | panel_tool_call 라우팅, messageQueue |
| `shell/src/panels/workspace/WorkspaceCenterPanel.tsx` | onToolCall handler |
| `shell/e2e/120-send-to-session.spec.ts` | E2E 테스트 |
| `shell/e2e/119-pty-terminal.spec.ts` | 회귀 픽스 mock |
