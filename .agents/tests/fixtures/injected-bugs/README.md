# Injected-Bug Test Fixtures

Files with deliberate bugs injected for detection rate testing (TC-2.3, TC-6.1).

## Injection Rules
- Copy a real file from the codebase
- Introduce ONE specific bug at a known line
- Document the bug precisely (file, line, type, description)
- Bug should be subtle enough that a casual read might miss it

## Fixture Files

### bug-01-race-condition.rs
**Source**: `shell/src-tauri/src/pty.rs` (copy)
**Bug**: Both reader thread and child-wait thread unconditionally call registry.remove() and
emit pty:exit with no coordination — double-remove and double-emit on normal child exit
**Type**: Race condition — two threads both remove from registry and emit exit event
**Line**: child-wait thread (registry_w.lock().unwrap().remove + app_w.emit)
**Expected detection**: Correctness reviewer should catch (concurrent state mutation, no guard)

### bug-02-path-traversal.rs
**Source**: `shell/src-tauri/src/panel.rs` (copy)
**Bug**: Remove the `canonical.starts_with(&home_path)` check at line 93
**Type**: Path traversal — panel_read_file can read files outside HOME
**Line**: 93
**Expected detection**: Security reviewer should catch (input validation)

### bug-03-integer-overflow.rs
**Source**: `shell/src-tauri/src/workspace.rs` (copy, function now_secs only)
**Bug**: Change `as_secs()` to `as_millis() as u64` — unit mismatch with downstream comparisons
**Type**: Unit mismatch — now_secs() returns millis, thresholds expect seconds, everything classifies as "stopped"
**Line**: 165
**Expected detection**: Difficult — tests correlated blind spot

### bug-04-missing-null-check.ts
**Source**: `shell/src/panels/workspace/constants.ts` + usage (synthetic)
**Bug**: Access `config.workspaceRoot.trim()` without checking if workspaceRoot is undefined
**Type**: Null reference — crashes on first run before config is set
**Line**: 5
**Expected detection**: Correctness reviewer should catch (edge case)

### bug-05-sql-injection.rs
**Source**: `shell/src-tauri/src/audit.rs` (copy)
**Bug**: Change parameterized query to string interpolation for one field
**Type**: SQL injection — user-controlled input in query string
**Line**: (varies by injection point)
**Expected detection**: Security reviewer should catch (OWASP pattern)

## Usage

```
/cross-review code-review "TC-2.3: Review .agents/tests/fixtures/injected-bugs/bug-01-race-condition.rs"
```

Record: was the injected bug found? By which reviewer? At what line?
