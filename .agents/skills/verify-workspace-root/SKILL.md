---
name: verify-workspace-root
description: workspace 루트 설정(#107) 핵심 불변식 검증. OnceLock 초기값, workspace_set_root 반환 타입, workspaceReady 게이트, resolvedRoot 업데이트 패턴, E2E mock 정확성 확인. workspace 관련 파일 변경 후 사용.
---

# Workspace Root 검증

## 목적

#107에서 추가된 workspace 루트 런타임 설정 구현의 핵심 불변식을 검증합니다:

1. **OnceLock 초기값** — `String::new()` 대신 `WORKSPACE_ROOT.to_string()` 사용 (경쟁 조건 창 방지)
2. **workspace_set_root 반환 타입** — `Result<String, String>` (canonical path 반환)
3. **lib.rs 등록** — `workspace_set_root`가 invoke_handler에 등록됨
4. **workspaceReady 게이트** — SessionDashboard가 `.finally()` 이후에만 마운트됨
5. **resolvedRoot 업데이트** — `.then(canonical => setResolvedRoot(canonical))` 패턴
6. **E2E mock** — `workspace_set_root` mock이 `lastSetRootArg` 캡처 포함

## When to Run

- `workspace.rs` 수정 후
- `WorkspaceCenterPanel.tsx` 수정 후
- `SessionDashboard.tsx` 수정 후
- workspace 관련 E2E spec 수정 후

## Related Files

| File | Purpose |
|------|---------|
| `shell/src-tauri/src/workspace.rs` | OnceLock 정의, workspace_set_root 커맨드 |
| `shell/src-tauri/src/lib.rs` | invoke_handler 등록 |
| `shell/src/panels/workspace/WorkspaceCenterPanel.tsx` | workspaceReady 게이트, resolvedRoot 상태 |
| `shell/src/panels/workspace/SessionDashboard.tsx` | workspaceRoot prop |
| `shell/e2e/91-workspace-panel.spec.ts` | E2E mock: workspace_set_root, lastSetRootArg |

## Workflow

### Step 1: OnceLock 초기값 검증

**파일:** `shell/src-tauri/src/workspace.rs`

**검사:** `OnceLock::get_or_init` 초기값이 `WORKSPACE_ROOT.to_string()`인지 확인.

```bash
grep -n "get_or_init\|OnceLock\|WORKSPACE_ROOT_OVERRIDE" shell/src-tauri/src/workspace.rs | head -10
```

**PASS:** `get_or_init(|| Mutex::new(WORKSPACE_ROOT.to_string()))` 존재.
**FAIL:** `String::new()` 사용 → `workspace_set_root` 첫 호출 전 다른 스레드가 `get_workspace_root()`를 호출하면 빈 문자열 반환.

수정: `Mutex::new(WORKSPACE_ROOT.to_string())`으로 변경.

### Step 2: workspace_set_root 반환 타입 검증

**파일:** `shell/src-tauri/src/workspace.rs`

**검사:** `workspace_set_root` 함수 시그니처가 `Result<String, String>`을 반환하는지 확인.

```bash
grep -n "fn workspace_set_root\|pub fn workspace_set_root" shell/src-tauri/src/workspace.rs
```

**PASS:** `-> Result<String, String>` 존재.
**FAIL:** `()` 반환 또는 시그니처 누락 → 프론트엔드가 canonical path를 받지 못함.

수정: 반환 타입을 `Result<String, String>`으로 변경, canonical path를 `Ok(canonical_str)`로 반환.

### Step 3: lib.rs 등록 검증

**파일:** `shell/src-tauri/src/lib.rs`

**검사:** `workspace_set_root`가 invoke_handler에 등록되어 있는지 확인.

```bash
grep -n "workspace_set_root" shell/src-tauri/src/lib.rs
```

**PASS:** `workspace::workspace_set_root,` 존재.
**FAIL:** 등록 누락 → 프론트엔드 `invoke("workspace_set_root")` 호출 시 `NOT FOUND` 오류.

수정: invoke_handler 등록 목록에 `workspace::workspace_set_root,` 추가.

### Step 4: workspaceReady 게이트 검증

**파일:** `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**검사:** SessionDashboard가 `workspaceReady` 조건부로 렌더되는지, `finally()`에서 `setWorkspaceReady(true)` 호출 확인.

```bash
grep -n "workspaceReady\|setWorkspaceReady\|SessionDashboard" shell/src/panels/workspace/WorkspaceCenterPanel.tsx | head -15
```

**PASS:**
- `{workspaceReady && (<SessionDashboard` 패턴 존재.
- `.finally(() => setWorkspaceReady(true))` 존재.

**FAIL:** `workspaceReady` 게이트 없음 → SessionDashboard의 `workspace_get_sessions`가 `workspace_set_root` 완료 전에 실행.

수정: `const [workspaceReady, setWorkspaceReady] = useState(false)` 추가, `.finally(() => setWorkspaceReady(true))` 추가, SessionDashboard를 `{workspaceReady && ...}`로 감싸기.

### Step 5: resolvedRoot 업데이트 패턴 검증

**파일:** `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**검사:** `.then(canonical => setResolvedRoot(canonical))` 패턴 존재 확인.

```bash
grep -n "resolvedRoot\|setResolvedRoot\|canonical" shell/src/panels/workspace/WorkspaceCenterPanel.tsx | head -15
```

**PASS:**
- `const [resolvedRoot, setResolvedRoot] = useState(activeWorkspaceRoot)` 존재.
- `.then((canonical) => setResolvedRoot(canonical))` 존재.
- `.catch(...)` 에서 fallback (`setResolvedRoot(WORKSPACE_ROOT)`) 존재.

**FAIL:** `resolvedRoot` 없이 raw `activeWorkspaceRoot` 직접 사용 → Fedora의 symlink 경로(예: `/home/luke` vs `/var/home/luke`) 불일치로 빈 상태 메시지 혼란.

수정: `resolvedRoot` 상태 추가, `.then/.catch` 체인에서 업데이트.

### Step 6: E2E mock — workspace_set_root 검증

**파일:** `shell/e2e/91-workspace-panel.spec.ts`

**검사:** `workspace_set_root` mock이 `lastSetRootArg`를 캡처하고 root 값을 반환하는지 확인.

```bash
grep -n "workspace_set_root\|lastSetRootArg" shell/e2e/91-workspace-panel.spec.ts
```

**PASS:**
- `cmd === "workspace_set_root"` 분기 존재.
- `window.__NAIA_E2E__.lastSetRootArg = (args && args.root) || null` 캡처.
- `return (args && args.root) || "${FAKE_ROOT}"` 반환.

**FAIL:** mock 누락 → `invoke("workspace_set_root")` 가 `undefined` 반환, `.then(canonical => ...)` 에서 `undefined`로 `resolvedRoot` 오염. workspaceReady 게이트가 동작하더라도 잘못된 경로 표시.

수정: mock 분기 추가.

## Output Format

```markdown
## verify-workspace-root 검증 결과

| 검사 | 상태 | 상세 |
|------|------|------|
| OnceLock 초기값 (WORKSPACE_ROOT) | PASS/FAIL | ... |
| workspace_set_root 반환 타입 | PASS/FAIL | ... |
| lib.rs invoke_handler 등록 | PASS/FAIL | ... |
| workspaceReady 게이트 | PASS/FAIL | ... |
| resolvedRoot .then() 업데이트 | PASS/FAIL | ... |
| E2E mock workspace_set_root | PASS/FAIL | ... |
```

## 예외사항

다음은 **문제가 아닙니다**:

1. **workspace_start_watch 순서** — `workspace_set_root` 이후 호출해야 하지만 이는 코드 주석으로 문서화됨. `workspaceReady` 게이트로 기본 앱 플로우에서 순서 보장.
2. **classifiedDirs의 AppConfig 부재** — classifiedDirs는 localStorage에 직접 저장됨 (`saveClassifiedDirs`/`loadClassifiedDirs`). AppConfig 필드 불필요.
3. **SessionDashboard workspaceRoot 기본값** — `workspaceRoot = WORKSPACE_ROOT` 기본값은 정상 (workspaceReady 게이트로 항상 resolvedRoot가 전달됨).
