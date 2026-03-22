<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Testing Strategy

> SoT: `.agents/context/testing.yaml`

## Philosophy

Integration-first TDD. Test real I/O, not mocked internals.
- Agent core: tested via stdio (pipe JSON in, assert JSON out)
- Shell: tested via Tauri WebDriver (tauri-driver)
- Gateway: tested via WebSocket client
- OS: tested by booting in a VM

## Frameworks

| Type | Tool |
|------|------|
| Unit/integration | Vitest (`describe.skipIf()` / `it.skipIf()` for conditional skips) |
| E2E (Shell) | @tauri-apps/cli (tauri-driver) + WebDriver |
| E2E (OS) | QEMU VM boot (libvirt in CI) |
| Rust | cargo test |
| Mocking | msw (Mock Service Worker) |

---

## Test Code Review Rule

Test code MUST be iteratively reviewed before trusting results. Faulty test logic masks real bugs.

1. Write test → review test code (assertions correct? target accurate? edge cases covered?)
2. Fix issues → re-review → repeat until TWO consecutive clean passes
3. Only then run the test
4. After pass: re-confirm "does this test actually validate the intended behavior?"

**Why:** Incorrect test logic (wrong assertions, missing edge cases, wrong mock setup) causes tests to pass while real bugs remain hidden. The test itself becomes the obstacle to finding the problem.

---

## Test Attitude

Tests are diagnostic tools, not scoreboards. See `agents-rules.json` `testing.test_attitude` for canonical rules.

### Anti-Patterns

| Anti-Pattern | Description | Correct Response |
|--------------|-------------|-----------------|
| **Assertion loosening** | Changing `===` to `includes`, removing checks, or widening match patterns to make a failing test pass | Read full error output, diagnose whether failure is in app code or test code, fix the actual source |
| **Expected value gaming** | Updating expected values to match the (buggy) actual output | If actual output is wrong, fix the code that produces it, not the expectation |
| **Test deletion** | Deleting or skipping a failing test instead of fixing the code it covers | Investigate why the test fails, fix app code, keep the test |

---

## Agent Testing

Spawn agent as child process, pipe stdin, assert stdout.

**Unit** (`agent/src/**/__tests__/*.test.ts`): Tool permission checks, JSON protocol parsing, audit log format.

**Integration** (`agent/tests/integration/*.test.ts`): Spawn agent-core with `--stdio`, write JSON to stdin, assert stdout. Examples: basic chat round-trip, tool call (file_read), permission denied (Tier 3), sub-agent spawn, streaming cancellation.

**E2E** (`agent/tests/e2e/*.test.ts`): Full flow with real LLM API. CI skip (requires API key, nightly only).

## Shell Testing

**Unit** (`shell/src/**/__tests__/*.test.ts`): Chat message formatting, emotion extraction, permission prompt logic.

**Component** (`shell/src/**/__tests__/*.test.ts`): testing-library (no real Tauri). Chat panel, permission modal, settings panel. Avatar 3D rendering is NOT component-tested (covered by E2E).

**E2E Mock** (`shell/e2e/*.spec.ts`): Playwright with mocked Tauri IPC. Fast but no real binary or Gateway.

#### E2E Mock Gotchas

| Gotcha | Rule |
|--------|------|
| `plugin:store\|get` tuple | `Store.get()` returns `[value, exists]` tuple. Mock MUST return `[null, false]`, NOT `null`. `plugin:store\|load` returns integer RID (e.g. `1`). Wrong values cause silent failures. |
| keepAlive panel visibility | keepAlive panels stay mounted in DOM. Inactive panels use `opacity: 0` on parent `.content-panel__slot`. Playwright `toBeVisible()` does NOT check ancestor opacity → false positive. Use `.content-panel__slot--active .panel-class` selector instead. |
| `exposeFunction` timing | `page.exposeFunction()` must be called BEFORE `page.goto()`. If registered after navigation, the function won't exist in already-loaded pages. Order: `exposeFunction → goto`. |
| xterm.js keepAlive stacking | Terminal components use `opacity:0 + pointerEvents:none` stacking. NEVER `display:none` — FitAddon.fit() returns 0×0 on hidden elements. In E2E, the canvas is not testable; test tab bar UI only. Mock `pty_create` → `{ pty_id, pid }`. See `shell/e2e/119-pty-terminal.spec.ts`. |

**E2E Tauri** (`shell/e2e-tauri/specs/*.spec.ts`): Real Tauri app via WebdriverIO v9 + tauri-driver. Real LLM calls (Gemini), real Gateway, real skill execution.

### E2E Tauri Prerequisites
- `webkit2gtk-driver` (apt/dnf)
- `cargo install tauri-driver --locked`
- `shell/.env` with `GEMINI_API_KEY`
- Gateway running on `:18789`
- Debug binary: `cargo build -p naia-shell`

### E2E Tauri Scenarios

| Spec | What it tests |
|------|---------------|
| 01 App launch | Clear state -> settings modal displayed |
| 02 Configure | Provider, API key, gateway URL/token, pre-approve tools |
| 03 Basic chat | Send message -> streaming -> non-empty response |
| 04 skill_time | Tool success or time pattern in response |
| 05 skill_system | Tool success or MB/GB/memory pattern |
| 06-07 skill_memo | Save + read + delete memo |
| 14 Skills tab | 20+ skill cards, search filter, built-in no toggle |
| 28 Skills install | Gateway cards, install buttons, feedback |

### E2E Observability (5 methods, #60)

Use these simultaneously when diagnosing E2E failures:

| # | Method | Location | Notes |
|---|--------|----------|-------|
| 1 | `llm-debug.log` | `~/.naia/logs/llm-debug.log` | JSON-line per LLM request. Always on. Best for provider/model mismatch. |
| 2 | `log_entry` chunks | DiagnosticsTab / `ui-message-trace.ndjson` | Agent emits on LLM start/error |
| 3 | Screenshots | `shell/e2e-tauri/.artifacts/screenshots/` | Taken at key E2E steps |
| 4 | Browser logs | `shell/e2e-tauri/.artifacts/browser-console.ndjson` | Via `browser.getLogs("browser")` |
| 5 | `CAFE_DEBUG_E2E=1` | Rust stderr + `~/.naia/logs/naia.log` | Set by `wdio.conf.ts` automatically |

### E2E Tauri Gotchas

- **panelVisible**: App does NOT render `ChatPanel` (no tabs) when `config.panelVisible === false`. Always write `panelVisible: true` in E2E config setups. `ensureAppReady()` enforces this.
- **VRM path**: Local dev path (`/home/.../assets/AvatarSample_B.vrm`) fails in webview. Use `/avatars/01-Sendagaya-Shino-uniform.vrm`. VRM failure does NOT block tabs.
- **WebKitGTK click**: `element.click()` returns "unsupported operation". Use `browser.execute(() => el.click())` via `clickBySelector` helper.
- **Stale elements**: WebKitGTK invalidates refs on React re-renders. Always use `browser.execute()` with fresh `querySelector()`.
- **React input**: Set value via native property setter + `dispatchEvent('input')`. Wait 100ms, then click send.
- **LLM nondeterminism**: Gemini may not always use tools. Use flexible assertions: tool-success element OR text pattern.
- **ensureAppReady no-key providers**: `alreadyConfigured` check requires `apiKey` OR `naiaKey` — but `claude-code-cli` and `ollama` need no API key. Without the fix, they are always treated as unconfigured and reset to gemini. Use `noKeyProviders` list (or `isApiKeyOptional()`) when determining `alreadyConfigured`.
- **provider/model default hardcoded**: When `savedModel` is empty, ChatPanel used `"gemini-2.5-flash"` as a hardcoded fallback regardless of active provider. Fix: use `getDefaultLlmModel(activeProvider)` first, then `"gemini-2.5-flash"` as last-resort only.

### E2E Methodology

- E2E must fail when AI response says feature unavailable.
- Don't mark PASS from single UI signal if final AI message contradicts it.
- Use semantic validation for assistant messages with explicit FAIL phrases.
- Always inspect message traces when a spec passes unexpectedly.
- Primary trace: `shell/e2e-tauri/.artifacts/ui-message-trace.ndjson`
- Tests are diagnostic tools -- a failure means "investigate app code", not "fix the test to pass".
- NEVER loosen assertions, change expected values, or skip test cases to make a failing test pass without first diagnosing the root cause in app code.

## Gateway Testing

**Unit** (`gateway/src/**/__tests__/*.test.ts`): Message routing, skill matching, memory storage, vector search.

**Integration** (`gateway/tests/integration/*.test.ts`): Start gateway on random port, connect WebSocket, send protocol messages. Examples: handshake, chat via gateway, skill invocation, memory recall.

**Channel tests**: Mock channel SDKs (discord.js, gramm Y). No real bot tokens in CI.

## OS Testing

**Smoke** (`os/tests/smoke.sh`): Boot ISO in headless QEMU, SSH in, check systemd services, Node.js, desktop entry, `~/.naia/`.

**CI**: GitHub Actions + QEMU. 5 min timeout. GPU-dependent tests skipped (manual verification).

## CI Pipeline

| Trigger | Steps |
|---------|-------|
| push | Biome lint, tsc --noEmit, agent/shell/gateway unit + integration, cargo test |
| PR | above + Shell E2E (agent mocked), Gateway E2E |
| main | above + BlueBuild image, OS smoke test (QEMU), ISO generation |
| nightly | Agent E2E with real LLM, full OS E2E (VM boot + app + chat) |

## Test Commands

```bash
pnpm test                              # All
pnpm --filter agent test:unit          # Agent unit
pnpm --filter agent test:integration   # Agent integration
pnpm --filter shell test:unit          # Shell unit
pnpm --filter shell test:component     # Shell component
pnpm --filter shell test:e2e           # Shell E2E (mock)
cd shell && pnpm run test:e2e:tauri    # Shell E2E (real Tauri)
pnpm --filter gateway test:unit        # Gateway unit
pnpm --filter gateway test:integration # Gateway integration
bash os/tests/smoke.sh                 # OS smoke
pnpm test:coverage                     # Coverage
```

## Mocking Strategy

- **LLM API**: msw (Mock Service Worker) with fixture files in `agent/tests/fixtures/llm-responses/*.json`
- **Channels**: Mock discord.js Client, gramm Y Bot. No real tokens in CI.
- **Filesystem**: Temp directories (`os.tmpdir()`), cleanup after each test.
- **Agent core for Shell**: Mock agent with `shell/tests/fixtures/mock-agent.js` (stdin/stdout fixture responses)

## E2E Full-Flow Scenarios

Cross-module tests:

| Scenario | Flow | Covers |
|----------|------|--------|
| Boot -> Chat | VM boot -> auto-login -> Shell launches -> avatar renders -> chat | os -> shell -> agent -> LLM |
| Tool execution | "create file" -> agent plans -> permission modal -> file created -> confirmed | shell -> agent -> tools -> fs -> audit |
| Permission block | "delete /etc/hosts" -> Tier 3 block -> blocked message | agent -> security -> audit |
| Crash recovery | Chat -> kill agent -> auto-restart -> chat again | shell -> agent (lifecycle) |
| External channel | Discord DM -> Gateway routes -> agent responds -> Discord reply | gateway -> agent -> discord |
| Game session | "join minecraft" -> connect -> "mine wood" -> bot mines | shell -> agent -> game (Phase 8) |

## Demo Video

Not a pass/fail test -- produces video artifact.
- Location: `shell/e2e/demo-video.spec.ts`
- Tool: Playwright with mocked Tauri IPC
- Pipeline: Playwright recording -> TTS narration -> ffmpeg merge
- Config: `.agents/context/demo-video.yaml`

---

*AI context: [.agents/context/testing.yaml](../../.agents/context/testing.yaml)*
