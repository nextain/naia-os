<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Implementation Plan

> SoT: `.agents/context/plan.yaml`

## Strategy: Deploy First, Add Features Incrementally

Every push = new ISO. BlueBuild + GitHub Actions auto-builds on every push.
**Day 1 = deployable.** Each phase yields a new ISO.

---

## Phase 0: Deploy Pipeline (Day 1-3)

> **Deliverable**: GitHub push -> BlueBuild -> ghcr.io image -> ISO (GitHub Releases)

- `os/recipe.yml` (BlueBuild recipe, base: Bazzite)
- `.github/workflows/build.yml` (GitHub Actions)
- ISO generation (ublue-os/titanoboa, live ISO)

**Done when**: USB boot = Bazzite + Node.js (no custom yet)

---

## Phase 1: Avatar on Screen (Week 1)

> **Deliverable**: Boot -> Alpha VRM avatar auto-starts on screen

**Stack**: Tauri 2, React 18+/TS/Vite, Three.js r0.182, @pixiv/three-vrm ^3.4.5, shadcn/ui, Zustand, Biome

### Steps
1. **Tauri 2 + React init** -- project setup in `shell/`
2. **AIRI VRM core extraction** -- copy Three.js VRM rendering from AIRI `stage-ui-three`
3. **Vue -> React hooks** -- port `useBlink`, `useIdleEyes`
4. **AvatarCanvas component** -- Three.js scene + VRM + idle animation
5. **Tauri window config** -- default window, app title "Naia Shell"
6. **Integration test** -- `pnpm tauri dev` -> avatar visible

**Done when**: USB boot -> Alpha avatar visible with idle animation + blink + saccade
**Reuse**: AIRI stage-ui-three (Three.js + @pixiv/three-vrm)

---

## Phase 2: Chat with Alpha (Week 2) -- Public Demo Point

> **Deliverable**: Text chat with Alpha, avatar lip-sync + emotions

**Default provider**: Google (Gemini) for chat/TTS/vision; Claude for coding
**Compatibility**: AAIF standard (AGENTS.md + SKILL.md + MCP), Claude Code compatible

### Tasks
- Agent core: LLM providers (xAI/Google/Claude), stdio protocol
- AAIF context consumption (.agents/ + AGENTS.md hierarchy)
- Tauri stdio bridge (spawn agent-core as child process)
- Chat panel UI + streaming response + cost display
- Avatar emotion mapping + lip-sync + TTS
- Onboarding: API key setup on first boot

**Done when**: USB boot -> API key -> chat with Alpha (lip-sync + emotions + cost visible)
**Reuse**: Careti stdio-adapter, lib.rs, LLM providers

---

## Phase 3: Alpha Does Work (Week 3-4) -- Complete

> **Deliverable**: Alpha can edit files, run terminal commands, search web

- Tool system: file_read, file_write, apply_diff, execute_command, browser, search, web_search
- Permission tiers (0-3) + approval UI
- Audit log (SQLite)
- Work progress panel
- Sub-agents (sequential + parallel spawn via Gateway RPC)

**Done when**: Alpha executes real OS tasks with permission system

---

## Phase 4: Always-On Daemon (Week 5-7) -- Complete

> **Deliverable**: Gateway daemon + external channels + memory
> **Strategy**: Gateway first -> Phase 3 runtime verification -> then new features

### Sub-phases

**4-0. OpenClaw Gateway local setup** -- Complete
- Gateway install, local start, WebSocket connection verified
- Auto-lifecycle: Tauri manages Gateway process (spawn/health/shutdown)

**4-1. Phase 3 E2E verification** -- Complete
- 8 tools runtime test, permission approval flow, sub-agent parallel execution, audit log

**4-3. Skills system** -- Complete
- 7 built-in skills (time, memo, weather, system_status, naia_discord, soul, exit)
- 63 custom skills (~/.naia/skills/ bootstrapped from agent/assets/default-skills/)
- E2E tests: 04-skill-time, 05-skill-system, 06-skill-memo

**4-4. Memory + UX + Onboarding** -- Complete
- 4.4a: Conversation persistence (STM) -- SQLite sessions + messages
- 4.4-ui: Shell UX (cost dashboard, history tab, error filter, message queue)
- 4.4-onboard: 5-step onboarding wizard (first-run experience)
- 4.4b: Session summarization + context recall (FTS5, LLM summaries)
- 4.4c: Semantic memory (facts table, LLM fact extraction)

**Memory architecture**: 2-tier (STM + LTM), pluggable MemoryProcessor interface
- Search evolution: SQLite LIKE -> FTS5 BM25 -> Gemini Embedding (future) -> sLLM (future)

**4-5. External channels** -- Complete
- Discord DM bot (naia-discord skill, OAuth integration)
- Gateway `provider_account_id` + lookup endpoint

**4-6. systemd auto-start** -- Planned
- Gateway auto-start on boot, health monitoring

**Done when**: OS boot -> auto-start -> external channel access -> remembers context

---

## Phase 5: Nextain Account Integration (Week 8-9) -- Complete

> **Deliverable**: OAuth login via naia.nextain.io, auto API key provisioning, credit dashboard

**Architecture**: Shell (Tauri) -> OAuth -> naia.nextain.io -> deep link `naia://` -> gatewayKey stored local -> Agent -> any-llm Gateway (GCP) -> LLM proxy + credit deduction

### Sub-phases
- 5-1: Deep link handler (Tauri `naia://` URI scheme)
- 5-2: Auth flow UI (Nextain button in onboarding, settings section)
- 5-3: LLM proxy integration (`lab-proxy.ts`, OpenAI-compatible)
- 5-4: Credit balance display
- 5-5: Tests (deep link, proxy provider, E2E)

**Done when**: Nextain login -> auto key provisioning -> LLM calls via gateway -> credit balance visible

---

## Phase 6: Tauri App Distribution (Week 10) -- Complete

> **Deliverable**: Standalone Linux app: Flatpak, AppImage, DEB, RPM via GitHub Releases

- Tauri bundle config (deb, rpm, AppImage, deep-link URI)
- CI: `release-app.yml`
- Flatpak manifest (`flatpak/io.nextain.naia.yml`) -- build success, Flathub submission pending

**Done when**: AppImage downloadable from GitHub Releases, installable on stock Linux

---

## Phase 7: OS ISO Build (Week 11) -- Complete

> **Deliverable**: Naia ISO: USB boot -> install -> complete AI OS

- Recipe includes Phase 6 AppImage/binary
- ISO builds live (iso-77, iso-78), R2 CDN download
- CI: `iso.yml`

**Done when**: ISO boots in VM, Naia Shell auto-starts with Lab login option

---

## Phase 8: Gaming with Alpha (Week 12+)

> **Deliverable**: Co-play Minecraft, game overlay avatar

- Minecraft agent (Mineflayer, autonomous actions)
- Generic game support (screen capture + vision model)
- Game overlay avatar + voice chat

**Done when**: Alpha joins Minecraft and plays autonomously
**Reuse**: AIRI services/minecraft/, Mineflayer

---

## Timeline Summary

```
Day 1-3:   Phase 0 (pipeline)    -> Bare ISO
Week 1:    Phase 1 (avatar)      -> Avatar-visible ISO
Week 2:    Phase 2 (chat)        -> Chat-capable ISO     <- Public demo
Week 3-4:  Phase 3 (tools)       -> Working AI OS ISO
Week 5-7:  Phase 4 (daemon)      -> Complete AI OS ISO
Week 8-9:  Phase 5 (Nextain)     -> Credit service mode
Week 10:   Phase 6 (app dist)    -> Standalone Linux app
Week 11:   Phase 7 (OS ISO)      -> Final ISO build
Week 12+:  Phase 8 (gaming)      -> Gaming AI OS ISO
```

## Attention Points

- **Phase 0**: Deploy pipeline = highest priority. Everything else layers on top.
- **Phase 2**: Public demo point. Must be polished enough to share.
- **Phase 5**: Lab integration enables credit-based monetization. Critical for sustainability.
- **Security**: Permission tiers active from Phase 3. Audit log from day one.
