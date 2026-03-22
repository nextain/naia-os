---
name: verify-resource-viewer
description: workspace 리소스 뷰어(이미지/CSV/로그/딥링크) 구현의 핵심 불변식 검증. Editor.tsx FILE_PATH_RE 뷰어 분기, ChatPanel 딥링크 정규식, E2E mock 패턴 확인. 리소스 뷰어 관련 파일 변경 후 사용.
---

# Workspace Resource Viewer 검증

## 목적

#116 에서 추가된 데이터/리소스/이미지 뷰어의 핵심 불변식을 검증합니다:

1. **FILE_PATH_RE 정확성** — ChatPanel의 파일 경로 정규식 lookbehind + 확장자 순서
2. **이미지 뷰어 격리** — 이미지 파일은 `convertFileSrc()` 사용, `workspace_read_file` 호출 없음
3. **파일 타입 분기 완전성** — isImage/isCsv/isLog 분류 커버리지
4. **접근성 준수** — 인터랙티브 `<th>` 요소에 tabIndex + onKeyDown 필수
5. **E2E mock 정확성** — `plugin:store|get` 튜플 반환, keepAlive panel 셀렉터

## When to Run

- `Editor.tsx` 또는 `ChatPanel.tsx` 수정 후
- 파일 뷰어 관련 E2E spec 수정 후
- FILE_PATH_RE 정규식 변경 후
- `plugin:store` mock 패턴이 포함된 E2E spec 추가 후

## Related Files

| File | Purpose |
|------|---------|
| `shell/src/panels/workspace/Editor.tsx` | 이미지/CSV/로그 뷰어 구현 |
| `shell/src/components/ChatPanel.tsx` | FILE_PATH_RE 딥링크 정규식 |
| `shell/src/panels/__tests__/editor-viewer.test.tsx` | Editor 단위 테스트 |
| `shell/src/components/__tests__/chat-deeplink.test.tsx` | 딥링크 단위 테스트 |
| `shell/e2e/116-resource-viewer.spec.ts` | E2E 통합 테스트 |

## Workflow

### Step 1: FILE_PATH_RE lookbehind 검증

**파일:** `shell/src/components/ChatPanel.tsx`

**검사:** FILE_PATH_RE에 `(?<![/\w])` lookbehind가 있는지 확인 (상대경로 false positive 방지).

```bash
grep -n "FILE_PATH_RE" shell/src/components/ChatPanel.tsx
```

**PASS:** `(?<![/\w])` 가 정규식 앞에 존재하고 확장자 목록에 `tsx` 가 `ts` 보다, `jsx` 가 `js` 보다 먼저 나타남.
**FAIL:** lookbehind 없음 → `shell/src/App.tsx` 같은 상대경로에서 `/src/App.tsx` 오탐 발생.

수정: `(?<![/\w])(\/[\w\-\.\/]+\.(?:...tsx|ts|jsx|js...)` 형태로 lookbehind 추가.

### Step 2: 이미지 뷰어 — workspace_read_file 호출 없음

**파일:** `shell/src/panels/workspace/Editor.tsx`

**검사:** isImage가 true일 때 `workspace_read_file`을 invoke하지 않고 `convertFileSrc()`만 사용하는지 확인.

```bash
grep -n "isImage\|convertFileSrc\|workspace_read_file" shell/src/panels/workspace/Editor.tsx
```

**PASS:** `convertFileSrc` 사용 확인, isImage 분기에서 `workspace_read_file` invoke 없음.
**FAIL:** isImage 경로에서 `workspace_read_file` 호출 → 바이너리 파일 불필요한 Rust 로드.

### Step 3: 파일 타입 분기 완전성

**파일:** `shell/src/panels/workspace/Editor.tsx`

**검사:** isImage, isCsv, isLog 분류가 모든 지원 확장자를 커버하는지 확인.

```bash
grep -n "isImage\|isCsv\|isLog\|\.png\|\.jpg\|\.csv\|\.log" shell/src/panels/workspace/Editor.tsx | head -30
```

**PASS:** isImage에 png/jpg/jpeg/gif/webp/svg 포함, isCsv에 csv 포함, isLog에 log 포함.
**FAIL:** 지원 확장자 누락 → 해당 파일 타입이 텍스트 에디터로 열림.

### Step 4: CSV th 접근성

**파일:** `shell/src/panels/workspace/Editor.tsx`

**검사:** CSV 테이블 헤더 `<th>` 에 onClick과 함께 `tabIndex={0}` 및 `onKeyDown` 핸들러가 있는지 확인.

```bash
grep -n "tabIndex\|onKeyDown\|<th" shell/src/panels/workspace/Editor.tsx
```

**PASS:** `tabIndex={0}`, `onKeyDown` (Enter/Space 처리), `onClick` 모두 존재.
**FAIL:** tabIndex 또는 onKeyDown 누락 → biome `useKeyWithClickEvents` lint 오류 + 키보드 접근 불가.

### Step 5: E2E mock — plugin:store|get 튜플

**파일:** `shell/e2e/116-resource-viewer.spec.ts`

**검사:** `plugin:store|get` mock이 `[null, false]` 튜플을 반환하는지 확인 (단순 null 아님).

```bash
grep -Fn "plugin:store|get" shell/e2e/116-resource-viewer.spec.ts
grep -Fn "plugin:store|load" shell/e2e/116-resource-viewer.spec.ts
```

**PASS:** `plugin:store|get` → `[null, false]`, `plugin:store|load` → `1` (정수 RID) 반환.
**FAIL:** `null` 반환 → Store.get()이 `[value, exists]` 구조분해 실패, 무증상 오류.

### Step 6: keepAlive panel 셀렉터 패턴

**파일:** `shell/e2e/116-resource-viewer.spec.ts`

**검사:** keepAlive 패널 가시성 확인에 `.content-panel__slot--active .workspace-panel` 셀렉터를 사용하는지 확인 (단순 `.workspace-panel` 아님).

```bash
grep -n "content-panel__slot--active\|workspace-panel" shell/e2e/116-resource-viewer.spec.ts
```

**PASS:** `.content-panel__slot--active .workspace-panel` 형태 사용.
**FAIL:** `.workspace-panel` 단독 사용 → keepAlive DOM에서 항상 "visible" 판정 (opacity:0 무시).

## Output Format

```markdown
## verify-resource-viewer 검증 결과

| 검사 | 상태 | 상세 |
|------|------|------|
| FILE_PATH_RE lookbehind | PASS/FAIL | ... |
| 이미지 workspace_read_file 격리 | PASS/FAIL | ... |
| 파일 타입 분기 완전성 | PASS/FAIL | ... |
| CSV th 접근성 | PASS/FAIL | ... |
| E2E plugin:store\|get 튜플 | PASS/FAIL | ... |
| keepAlive 셀렉터 패턴 | PASS/FAIL | ... |
```

## 예외사항

다음은 **문제가 아닙니다**:

1. **PDF 미지원** — PDF는 P3 stretch goal로 의도적으로 제외됨. isImage/isCsv/isLog에 없어도 정상.
2. **log tail-follow 없음** — AC에 없어서 의도적으로 미구현. 로그 뷰어에 follow 기능 없어도 정상.
3. **biome-ignore 주석** — `noArrayIndexKey`, `noDangerouslySetInnerHtml`, `useExhaustiveDependencies` suppress는 JSX 내부 인라인에 위치해야 함. JSX 외부 suppress는 잘못된 것임.
4. **convertFileSrc import** — Tauri API import에 `convertFileSrc`가 있어야 함. 없으면 문제.
