---
name: verify-worktree-grouping
description: workspace worktree 그룹핑(#121) 핵심 불변식 검증. groupBy origin_path??path 키 로직, origin_path_cache stop_watch clear, 3-함수 canonicalize 일관성, WorktreeGroup 초기 상태 확인. workspace 관련 파일 변경 후 사용.
---

# verify-worktree-grouping

workspace git worktree grouping (#121) 구현의 핵심 불변식을 검증합니다.

## Workflow

### Step 1: groupBy 키 로직 확인

`SessionDashboard.tsx`의 `renderGrouped`에서 `origin_path ?? path` 키를 올바르게 사용하는지 확인합니다.

```bash
grep -n "origin_path.*path\|groupMap" shell/src/panels/workspace/SessionDashboard.tsx
```

**PASS 조건**: `session.origin_path ?? session.path` 존재. `groupMap.get(key)` / `groupMap.set(key, [session])` 패턴 존재.

### Step 2: WorktreeGroup 초기 상태 확인

`WorktreeGroup.tsx`에서 `useState(false)` (초기 펼침 상태)가 유지되는지 확인합니다.

```bash
grep -n "useState" shell/src/panels/workspace/WorktreeGroup.tsx
```

**PASS 조건**: `useState(false)` 존재 (true이면 기본 접힘 — 사용자 경험 저하).

### Step 3: origin_path_cache stop_watch clear 확인

`workspace_stop_watch`가 `origin_path_cache_arc`를 명시적으로 clear하는지 확인합니다 (L047: stop→start 후 stale 캐시 방지).

```bash
grep -n "origin_path_cache" shell/src-tauri/src/workspace.rs
```

**PASS 조건**:
- `origin_path_cache:` 필드 선언 존재
- `origin_path_cache_arc` clone 블록 존재 (`workspace_get_sessions` 내부)
- `origin_path_cache_arc.*clear()` 존재 (`workspace_stop_watch` 내부)

### Step 4: path canonicalize 일관성 확인

세 함수 모두 `std::fs::canonicalize` 를 사용하는지 확인합니다 (L046: Fedora `/home`→`/var/home` 심링크 이슈).

```bash
grep -n "canonicalize\|to_string_lossy" shell/src-tauri/src/workspace.rs
```

**PASS 조건**:
- `workspace_get_sessions`에 `std::fs::canonicalize(&path)` 존재
- `workspace_classify_dirs`에 `std::fs::canonicalize` 존재
- `get_all_worktree_paths`에 `std::fs::canonicalize` 존재
- `path.to_string_lossy().to_string()` 단독 사용 없음 (fallback 패턴 `unwrap_or_else(|_| path.to_string_lossy()...)` 는 허용)

### Step 5: E2E WG 테스트 origin_path mock 확인

91 E2E spec의 WG 테스트 mock이 `origin_path` 필드를 올바르게 포함하는지 확인합니다.

```bash
grep -n "origin_path" shell/e2e/91-workspace-panel.spec.ts
```

**PASS 조건**: `origin_path: null` (standalone 세션), `origin_path: \`...path...\`` (linked worktree) 패턴 존재. `FAKE_SESSIONS_WORKTREE` 에 `origin_path` 포함.

## Exceptions

다음은 **문제가 아닙니다**:

1. **`unwrap_or_else(|_| path.to_string_lossy()...)`** — canonicalize 실패 시 fallback, 정상 패턴
2. **`None` 값의 `origin_path`** — main worktree는 `origin_path = None`, 정상
3. **`session.origin_path ?? session.path`의 `??`** — TypeScript nullish coalescing, `null`과 `undefined` 모두 처리

## Related Files

| File | Purpose |
|------|---------|
| `shell/src/panels/workspace/SessionDashboard.tsx` | renderGrouped — groupBy 키 로직 |
| `shell/src/panels/workspace/WorktreeGroup.tsx` | 워크트리 그룹 컴포넌트, 접기/펼치기 |
| `shell/src-tauri/src/workspace.rs` | origin_path_cache, get_main_worktree, canonicalize |
| `shell/e2e/91-workspace-panel.spec.ts` | WG1/WG2 E2E 테스트, origin_path mock |
