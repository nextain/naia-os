# Lessons Learned

> Mirror: `.agents/context/lessons-learned.yaml`

Accumulated lessons from development cycles. Read during INVESTIGATE phase. Written during SYNC phase.

**Schema**: `id`, `date`, `issue`, `category`, `title`, `problem`, `root_cause`, `fix`, and optional `scope` (file glob or module name — omit for global/workflow-level lessons). Example scope: `"shell/src/audio/*"`, `"agent/llm-registry"`.

> **Context Update Rule**: If a new lesson is similar to an existing entry → do NOT add a duplicate. Strengthen a hook instead (see `harness.md` → Context Update Matrix).

---

## L001 — E2E incomplete but marked as complete (#60)

**Date**: 2026-03-15 | **Category**: Testing

**Problem**: LLM Provider Registry (#60) was marked as 5-phase complete, but E2E provider switching tests were blocked by infrastructure issues (tauri-driver SIGINT). Work was reported as "done" without actual E2E verification.

**Root cause**: No rule requiring E2E completion before marking work done. AI success bias — uncertain state reported as complete.

**Fix**: Added test_attitude rules, diagnose step in on_failure, success_bias_reporting in AI behavioral traps.

---

## L002 — Test pass ≠ correct behavior

**Date**: 2026-03-15 | **Category**: Testing

**Problem**: AI loosened test assertions to make failing tests pass instead of investigating app code bugs.

**Root cause**: e2e_test phase output was defined as "Passing E2E test", making "pass" the explicit goal. No anti-patterns for test gaming.

**Fix**: Output redefined to "E2E diagnostic complete". Added test_attitude anti-patterns (assertion loosening, expected value gaming, test deletion).

---

## L003 — Debug logging added only after bugs discovered

**Date**: 2026-03-15 | **Category**: Observability

**Problem**: When a bug occurred, first step was always adding Logger.debug() — meaning the first occurrence was always undiagnosed.

**Root cause**: debug_logging rules specified what and how to log, but not WHEN (build-time vs debug-time).

**Fix**: Added debug_logging.when rule: "Debug logging is a BUILD-TIME activity". Added to review checklists.

---

## L004 — Landscape research skipped — wrong upstream target discovered after full implementation (#73)

**Date**: 2026-03-18 | **Category**: Upstream Integration

**Problem**: Implemented SupportsAudioOutput in a vllm fork only to discover vllm-omni is the correct upstream target. Audio output was explicitly scoped out of vllm main (RFC #16052). Full implementation wasted.

**Root cause**: No pre-work research step before forking. RFC history not checked. Sub-project existence (vllm-omni) not discovered. No upstream issue opened before coding.

**Fix**: Added `upstream-contribution.yaml` workflow — landscape research required before any implementation (scope check, AI policy, RFC history, sub-project discovery, maintainer stance). Progress file `upstream_issue_ref` field added. commit-guard advisory for upstream contributions.

**Reference**: `.agents/context/upstream-contribution.yaml`

---

## L005 — Context compaction skips mandatory reads — rules not followed in resumed session (#89)

**Date**: 2026-03-19 | **Category**: Workflow

**Problem**: When context was compacted and session resumed from summary, AI jumped directly into implementation without performing mandatory reads (agents-rules.json, ai-work-index.yaml, project-index.yaml). Result: build-time logging skipped, iterative review not done, success_bias_reporting triggered, user felt AI was developing autonomously without oversight.

**Root cause**: CLAUDE.md mandatory reads say "every session start". But compacted resumption is treated as a continuation, not a new session — the mandate was never triggered. Summary did not contain a reminder to re-read rules.

**Fix**: After context compaction, the resumed session MUST treat itself as a new session start: read agents-rules.json before proceeding with any implementation. Progress file (`.agents/progress/*.json`) must be maintained so resumed sessions know which phase/gate they are in.

---

## L006 — panel_install_result must arrive before panel_control reload — timing is critical (#89)

**Date**: 2026-03-20 | **Category**: IPC | **Scope**: `shell/src/components/PanelInstallDialog.tsx`, `agent/src/index.ts`

**Problem**: PanelInstallDialog auto-close logic depends on `successRef` being set by `panel_install_result`. If `panel_control reload` arrives first, `successRef` is still false → dialog never closes even on success.

**Root cause**: `actionInstall` internally emits `panel_control reload` at the end. The agent wrapper did not suppress this and emitted its own reload after the result — but order was not guaranteed.

**Fix**: Agent `panel_install` handler passes `writeLine: () => undefined` to `actionInstall` (suppresses inner `panel_control`). After awaiting result, it explicitly emits `panel_install_result` FIRST, then `panel_control reload` (only if success). Order is now deterministic.

---

## L007 — Events without requestId cannot use chat-service filter — use direct listen() (#89)

**Date**: 2026-03-20 | **Category**: IPC | **Scope**: `shell/src/components/PanelInstallDialog.tsx`, `shell/src/lib/chat-service.ts`

**Problem**: `panel_install_result` has no `requestId` field. `chat-service.ts` filter drops any chunk where `chunk.requestId !== requestId`, so `panel_install_result` was silently discarded.

**Root cause**: `requestId` filter was written for chat responses (all of which carry `requestId`). New event types that originate outside the normal chat flow do not carry `requestId`.

**Fix**: `PanelInstallDialog` uses Tauri `listen('agent-response-chunk')` directly, bypassing `chat-service`. TypeScript type check also required guard: `!('requestId' in chunk) || chunk.requestId !== requestId`.

---

## L008 — Terminology drift (app vs panel) causes widespread confusion — pick one and enforce (#89)

**Date**: 2026-03-20 | **Category**: Naming | **Scope**: `agent/src/skills/built-in/panel.ts`, `shell/src-tauri/src/panel.rs`, `docs/`

**Problem**: Mid-implementation, "app" terminology was partially adopted (`app.json`, `~/.naia/apps/`). Mixed with existing "panel" terms, creating broken file references and confusing documentation.

**Root cause**: Naming decision was made informally and not propagated atomically. Each file was updated independently without a checklist.

**Fix**: Reverted all "app" terms back to "panel". Enforced: `panel.json`, `~/.naia/panels/`, `panel_list_installed`, `panel_remove_installed`, `PanelDescriptor`. Added `critical_gotchas.terminology` in `architecture.yaml`.

---

## L009 — kill -0 succeeds on zombie processes — CDP health check required to detect Chrome death (#95)

**Date**: 2026-03-20 | **Category**: Process Management | **Scope**: `shell/src-tauri/src/browser.rs`

**Problem**: When Chrome was killed with SIGKILL, it became a zombie (parent hadn't reaped it). `libc::kill(pid, 0)` returns 0 for zombies because the PID still exists in the process table. The monitor thread never emitted `browser_closed`, so the frontend never showed the error UI.

**Root cause**: `kill -0` is a live/dead check at the OS level, not a responsive-process check. A zombie occupies a PID slot but serves no HTTP.

**Fix**: Added CDP `/json/version` health check as secondary detector: if `kill -0` succeeds but CDP refuses connection, Chrome is a zombie → emit `browser_closed`. See `spawn_chrome_monitor()` in `browser.rs`.

---

## L010 — CEF Rust bindings not production-ready as of 2026 — use Chrome binary + XReparentWindow (#95)

**Date**: 2026-03-20 | **Category**: Frontend | **Scope**: `shell/src/panels/browser/*`

**Problem**: Considered using CEF (Chromium Embedded Framework) Rust bindings for an embedded browser. All available Rust CEF crates are experimental, unmaintained, or archived as of 2026.

**Root cause**: CEF Rust ecosystem is immature. CEF itself is a C++ library and Rust bindings lag behind significantly.

**Fix**: Use Chrome binary subprocess + X11 XReparentWindow (`x11rb`) for embedding. Achieves identical UX: user sees Chromium, CDP is available for AI. Requires `GDK_BACKEND=x11` (XWayland mode) and must run via distrobox (not host Bazzite) for GTK/WebKit library linking.

---

## L011 — gemini-2.5-flash-live is WebSocket-only — SSE /v1/chat/completions returns silent 0-byte body (#95)

**Date**: 2026-03-20 | **Category**: Provider | **Scope**: `agent/src/providers/lab-proxy.ts`

**Problem**: User set LLM model to `gemini-2.5-flash-live` for text chat. Lab proxy sent it to Vertex AI `/v1/chat/completions` (SSE endpoint). Vertex AI returned 200 OK with a completely empty body — no data, no error. App threw "empty SSE stream" error.

**Root cause**: Gemini Live models are WebSocket-only (Live API). Vertex AI's REST endpoint does not support them and silently returns an empty 200 response instead of a proper error.

**Fix**: Added `toGatewayModel()` mapping in `lab-proxy.ts`: `"gemini-2.5-flash-live"` → `"vertexai:gemini-2.5-flash"`. Also added `bytesReceived==0` guard to detect silent 0-byte streams with a clear error message.

---

## L012 — Voice session must receive tools via session.connect() — Gemini says "tools off" without it (#95)

**Date**: 2026-03-20 | **Category**: Voice | **Scope**: `shell/src/components/ChatPanel.tsx`, `shell/src/lib/voice/*`

**Problem**: Gemini Live voice session said "내 도구 사용 설정이 꺼져 있어서 (tools are disabled)" even when `config.enableTools=true`. User could see the tools toggle was on. The AI's voice responses showed it thought tools weren't available.

**Root cause**: `session.connect()` was called without a `tools` parameter. Gemini Live's `function_declarations` field was empty. Even if the system prompt mentioned tools, Gemini won't call them unless they're declared in the session setup.

**Fix**: `ChatPanel` reads active panel tools from `panelRegistry.get(activePanelId)?.tools`, maps them to `ToolDeclaration` format, and passes to `session.connect({ tools: voiceTools, systemInstruction: voiceSystemPrompt })`. System prompt also appended with explicit tool list and "call them proactively" instruction.

---

## L013 — position:fixed overlays cover full viewport including embedded Chrome X11 area (#95)

**Date**: 2026-03-20 | **Category**: CSS | **Scope**: `shell/src/styles/global.css`, `shell/src/components/SettingsTab.tsx`

**Problem**: STT model modal (`.sync-dialog-overlay` uses `position:fixed; left:0; right:0`) appeared over the Chrome X11 embedded area instead of staying within the naia chat panel.

**Root cause**: `position:fixed` positions relative to the viewport, which includes the full window width. The Chrome X11 window is embedded at `x > naia-panel-width`, so fixed overlays that stretch to `right:0` cover the Chrome area.

**Fix**: Added `.panel-modal-overlay` class with `width: var(--naia-width, 320px)` instead of `right:0`. Modals that must stay within the panel should use this class rather than the full-viewport `.sync-dialog-overlay`.

---

## L014 — CSS syntax error in global.css causes entire Vite app to fail to render — all E2E tests fail with "element not found" (#99)

**Date**: 2026-03-21 | **Category**: CSS | **Scope**: `shell/src/styles/global.css`

**Problem**: E2E tests failed at `beforeEach` with "locator(.chat-panel) not found" even though config and mock were correct. All 13 tests failed.

**Root cause**: A CSS editing mistake left an orphaned `color:` property and `}` outside any rule at `global.css:5117–5118`. PostCSS threw "Unexpected }" parse error, Vite showed the error overlay and never mounted React.

**Fix**: Removed the orphaned lines. Always verify CSS compiles successfully after editing `global.css` — check browser devtools or Vite server response for `[plugin:vite:css]` errors before running E2E.

---

## L015 — Playwright strict mode: `[data-panel-id]` matches both wrapper div and button — use `button[data-panel-id]` (#99)

**Date**: 2026-03-21 | **Category**: E2E | **Scope**: `shell/e2e/*.spec.ts`

**Problem**: Locator `'[data-panel-id="workspace"]'` resolved to 2 elements: the wrapper div AND the button inside it. Playwright strict mode threw "strict mode violation" and the test failed.

**Root cause**: ModeBar renders a wrapper div with `data-panel-id` for styling, and the inner button also has `data-panel-id` for accessibility/testing. Using a generic attribute selector matches both.

**Fix**: Use `'button[data-panel-id="workspace"]'` to target only the interactive button element.

---

## L016 — Circular import between FileTree and WorkspaceCenterPanel — inline shared type to break cycle (#99)

**Date**: 2026-03-21 | **Category**: React | **Scope**: `shell/src/panels/workspace/FileTree.tsx`, `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**Problem**: `FileTree` imported `ClassifiedDir` type from `WorkspaceCenterPanel`, while `WorkspaceCenterPanel` imported `FileTree`. TypeScript/bundler resolved it but created a circular dependency.

**Root cause**: Both components needed the same `ClassifiedDir` interface. Defining it in the parent (`WorkspaceCenterPanel`) and importing in the child (`FileTree`) created a circular dependency.

**Fix**: Define the inline type directly in FileTree props: `Array<{name: string; path: string; category: string}>`. `WorkspaceCenterPanel` re-exports its own `ClassifiedDir` interface separately for the Naia tool handler.

---

## L017 — `idleToastTimerRef` must be cleared in interval `useEffect` cleanup to prevent setState on unmounted component (#99)

**Date**: 2026-03-21 | **Category**: React | **Scope**: `shell/src/panels/workspace/WorkspaceCenterPanel.tsx`

**Problem**: The idle notification `setInterval` creates a toast timer (`setTimeout`) when idle sessions are detected. The interval cleanup correctly called `clearInterval`, but not `clearTimeout` on the pending toast timer.

**Root cause**: The toast timer runs 6s after an idle alert. If the component unmounts (tab switch) while the timer is pending, `setIdleToast(null)` would be called on an unmounted component.

**Fix**: In the interval cleanup function, also call: `if (idleToastTimerRef.current) clearTimeout(idleToastTimerRef.current)`.
