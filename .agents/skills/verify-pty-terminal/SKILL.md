---
name: verify-pty-terminal
description: PTY 터미널 탭(#119) 핵심 불변식 검증. openDirsRef add-before-await, terminalsRef timing, xterm keepAlive opacity 패턴, E2E mock 정확성 확인. PTY 터미널 관련 파일 변경 후 사용.
---

# PTY Terminal 검증

## 목적

#119에서 추가된 PTY 터미널 탭 구현의 핵심 불변식을 검증합니다:

1. **openDirsRef add-before-await** — `pty_create` 호출 전에 dir를 Set에 추가하여 동시 중복 스폰 방지
2. **terminalsRef timing invariant** — `terminalsRef.current` 업데이트가 render body에서 이루어짐 (setTerminals() callback 아님)
3. **xterm keepAlive opacity 패턴** — `display:none` 대신 `opacity:0 + pointerEvents:none` 사용 (FitAddon 0×0 방지)
4. **E2E mock 정확성** — `plugin:store|get` 튜플 반환, `pty_create` mock 구조

## When to Run

- `Terminal.tsx` 수정 후
- `WorkspaceCenterPanel.tsx` 수정 후
- PTY 관련 E2E spec 수정 후
- keepAlive 패널 가시성 관련 코드 변경 후

## Related Files

| File | Purpose |
|------|---------|
| `shell/src/panels/workspace/WorkspaceCenterPanel.tsx` | openDirsRef dedup, terminalsRef timing, pty_create 호출 |
| `shell/src/panels/workspace/Terminal.tsx` | xterm.js keepAlive opacity 패턴 |
| `shell/src/panels/workspace/index.tsx` | keepAlive: true 설정 |
| `shell/e2e/119-pty-terminal.spec.ts` | E2E mock: plugin:store|get 튜플, pty_create mock |

## Workflow

### Step 1: openDirsRef add-before-await 검증

**파일:** `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**검사:** `openDirsRef.current.add(dir)` 가 `await invoke("pty_create", ...)` 보다 앞에 있는지 확인.

```bash
grep -n "openDirsRef.current.add\|await invoke.*pty_create\|\"pty_create\"" shell/src/panels/workspace/WorkspaceCenterPanel.tsx
```

**PASS:** `openDirsRef.current.add(dir)` 줄 번호 < `await invoke("pty_create"` 줄 번호.
**FAIL:** add 이후 await가 없거나 순서 역전 → 동시 요청 시 중복 PTY 스폰 가능.

수정: `openDirsRef.current.add(dir)` 를 `try` 블록 진입 직후, await 호출 전으로 이동.

### Step 2: openDirsRef delete-on-failure 검증

**파일:** `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**검사:** `catch` 블록에 `openDirsRef.current.delete(dir)` 가 있는지 확인.

```bash
grep -n "openDirsRef.current.delete" shell/src/panels/workspace/WorkspaceCenterPanel.tsx
```

**PASS:** catch 블록 + handleCloseTerminal + handleTerminalExit 에서 delete 호출 존재.
**FAIL:** catch 블록에 delete 없음 → 실패 후 dir 영구 잠금 (앱 재시작 전까지 해당 dir 재오픈 불가).

### Step 3: terminalsRef render-body timing 검증

**파일:** `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**검사:** `terminalsRef.current = terminals` 가 render body에서 (useEffect 밖에서) 동기적으로 실행되는지 확인.

```bash
grep -n "terminalsRef.current = terminals\|terminalsRef\.current" shell/src/panels/workspace/WorkspaceCenterPanel.tsx | head -10
```

**PASS:** `terminalsRef.current = terminals` 가 컴포넌트 함수 최상위 레벨 (useCallback/useEffect 블록 밖)에 위치.
**FAIL:** useEffect나 setTerminals callback 내부에 위치 → find() 호출 시 stale 값 참조 가능.

수정: `const terminalsRef = useRef(...)` 선언 직후 (render body) 에 `terminalsRef.current = terminals` 위치.

### Step 4: xterm keepAlive opacity:0 패턴 검증

**파일:** `shell/src/panels/workspace/Terminal.tsx`

**검사:** 비활성 터미널 hide에 `display: none` 대신 `opacity: 0` + `pointerEvents: "none"` 인라인 스타일 사용 확인.

```bash
grep -n "display.*none\|opacity.*0\|pointerEvents" shell/src/panels/workspace/Terminal.tsx
```

**PASS:** `opacity: 0` + `pointerEvents: "none"` 조합 사용, `display: none` 없음.
**FAIL:** `display: none` 사용 → FitAddon.fit()이 0×0 크기 반환, 터미널이 탭 전환 후 빈 화면.

수정: `style={active ? undefined : { opacity: 0, pointerEvents: "none" }}` 패턴 사용.

### Step 5: keepAlive: true 설정 검증

**파일:** `shell/src/panels/workspace/index.tsx`

**검사:** workspace panel 등록 시 `keepAlive: true` 로 설정되어 있는지 확인.

```bash
grep -n "keepAlive" shell/src/panels/workspace/index.tsx
```

**PASS:** `keepAlive: true` 존재.
**FAIL:** `keepAlive: false` 또는 미설정 → 탭 전환마다 컴포넌트 언마운트, PTY 재시작.

### Step 6: E2E mock — plugin:store|get 튜플 검증

**파일:** `shell/e2e/119-pty-terminal.spec.ts`

**검사:** `plugin:store|get` mock이 `[null, false]` 튜플을 반환하는지 확인 (단순 null 아님).

```bash
grep -n "plugin:store" shell/e2e/119-pty-terminal.spec.ts
```

**PASS:** `plugin:store|get` → `[null, false]`, `plugin:store|load` → `1` (정수 RID).
**FAIL:** `null` 반환 → Store.get()의 `[value, exists]` 구조분해 실패, 무증상 오류.

### Step 7: E2E mock — pty_create 구조 검증

**파일:** `shell/e2e/119-pty-terminal.spec.ts`

**검사:** `pty_create` mock이 `{ pty_id: string, pid: number }` 구조로 반환하는지 확인.

```bash
grep -n "pty_create\|pty_id\|pid" shell/e2e/119-pty-terminal.spec.ts | head -15
```

**PASS:** mock 반환값에 `pty_id` (string) 와 `pid` (number) 포함.
**FAIL:** 구조 불일치 → WorkspaceCenterPanel.tsx 의 `result.pty_id`, `result.pid` 참조 실패.

## Output Format

```markdown
## verify-pty-terminal 검증 결과

| 검사 | 상태 | 상세 |
|------|------|------|
| openDirsRef add-before-await | PASS/FAIL | ... |
| openDirsRef delete-on-failure | PASS/FAIL | ... |
| terminalsRef render-body timing | PASS/FAIL | ... |
| xterm keepAlive opacity:0 | PASS/FAIL | ... |
| keepAlive: true 설정 | PASS/FAIL | ... |
| E2E plugin:store\|get 튜플 | PASS/FAIL | ... |
| E2E pty_create mock 구조 | PASS/FAIL | ... |
```

## 예외사항

다음은 **문제가 아닙니다**:

1. **pty_kill fire-and-forget** — `invoke("pty_kill", ...).catch(...)` 에서 에러를 무시하는 것은 의도된 동작 (OS 프로세스 kill 실패는 무시, openDirsRef delete는 별도 처리)
2. **handleCloseTerminal의 terminalsRef 사용** — setTerminals() 이전에 terminalsRef.current.find()를 쓰는 것이 정상 (render-body 업데이트 보장으로 stale 없음)
3. **Terminal.tsx 내부 display 속성** — xterm.js가 내부적으로 canvas에 적용하는 display 속성은 여기서 검사하지 않음
4. **E2E에서 pty:output/pty:exit 이벤트 미모킹** — PTY I/O는 E2E 범위 밖 (실제 PTY 없음), 탭 바 UI만 테스트
