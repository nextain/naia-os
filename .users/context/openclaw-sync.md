# OpenClaw Config Synchronization

## Overview

Synchronizes Shell (Tauri app) user settings to OpenClaw Gateway bootstrap files.
This ensures Gateway features (Discord DM, TTS, etc.) use the same persona and credentials as the Shell.

## Sync Triggers

| Trigger | File | Function |
|---------|------|----------|
| Settings save | `SettingsTab.tsx` | `handleSave()` |
| Onboarding complete | `OnboardingWizard.tsx` | `handleComplete()` |
| Lab auth callback | `SettingsTab.tsx` | `lab_auth_complete` listener |
| App startup | `ChatPanel.tsx` | session load useEffect |
| After session summarization | `ChatPanel.tsx` | `summarizePreviousSession()` |
| After auto fact extraction | `ChatPanel.tsx` | every 10 messages / visibilitychange |
| After reverse sync | `memory-sync.ts` | `syncFromOpenClawMemory()` |

## Sync Items

### 1. `openclaw.json` — Provider/Model

| Shell Provider | OpenClaw Provider |
|---------------|-------------------|
| gemini | google |
| anthropic | anthropic |
| xai | xai |
| openai | openai |
| nextain | nextain |
| claude-code-cli | anthropic |
| ollama | ollama |

### 2. `auth-profiles.json` — API Key
- Skipped for Lab proxy (nextain) and keyless providers

### 3. `SOUL.md` — System Prompt (complete)
Full output from `buildSystemPrompt()`:
- Persona text (with name substitution)
- Emotion tag instructions
- User name context
- **Known facts about the user (from Shell facts DB)**
- Language/locale instructions

> **Key**: `syncToOpenClaw()` is self-contained — always loads config + facts internally.
> Caller's `_systemPrompt` parameter is ignored. All sync paths include facts consistently.

### 4. `IDENTITY.md` / `USER.md`
- Agent name, user name

## Memory Sync

### Dual-Origin Architecture

| Aspect | Shell | OpenClaw |
|--------|-------|----------|
| Role | "Who the user is" (facts) | "What happened" (session records) |
| Storage | `memory.db` (SQLite, facts table) | `workspace/memory/*.md` + `memory/main.sqlite` |

### Shell to OpenClaw (facts in SOUL.md)

Facts DB content is injected into SOUL.md so OpenClaw-only paths (Discord DM, etc.) can access user info.

### Auto-extraction During Conversation

Facts are extracted automatically during conversation without requiring "New Conversation" click:
- **Every 10 messages**: triggered in `usage` chunk handler
- **App goes to background**: `visibilitychange` event, threshold 3+ unextracted messages
- Uses `extractFacts()` only (lightweight, no summarization)

### OpenClaw to Shell (reverse sync)

Reads `workspace/memory/*.md` files saved by OpenClaw's `session-memory` hook:
- `read_openclaw_memory_files(since_ms)` Rust command reads files
- LLM extracts facts -> `upsertFact()` -> `syncToOpenClaw()`
- Runs 5s after app start + every 30 minutes

### session-memory Hook

OpenClaw internal hook that auto-saves conversations to `workspace/memory/*.md`.
Enabled via `config/defaults/openclaw-bootstrap.json`.

## Chat Routing

| Setting | Value | Behavior |
|---------|-------|----------|
| `AppConfig.chatRouting` | `"auto"` (default) | Route via Gateway when connected; fallback to direct LLM |
| | `"gateway"` | Always route via Gateway |
| | `"direct"` | Always use direct LLM (original behavior) |

Agent field: `ChatRequest.routeViaGateway` (boolean)

## Key Files

- `shell/src/lib/openclaw-sync.ts` — `syncToOpenClaw()` (self-contained)
- `shell/src/lib/memory-sync.ts` — reverse sync (OpenClaw -> Shell)
- `shell/src/lib/memory-processor.ts` — `extractFacts()`, `summarizeSession()`
- `shell/src/lib/persona.ts` — `buildSystemPrompt()`
- `shell/src/lib/db.ts` — `getAllFacts()`, `upsertFact()`
- `shell/src/components/ChatPanel.tsx` — auto-extraction triggers
- `shell/src/components/SettingsTab.tsx` — handleSave trigger
- `shell/src/components/OnboardingWizard.tsx` — handleComplete trigger
- `shell/src-tauri/src/lib.rs` — `sync_openclaw_config`, `read_openclaw_memory_files`

## Constraints

- **OpenClaw source is NOT modifiable**
- Sync is best-effort; errors are logged but never block UI
- SOUL.md receives the FULL system prompt (emotion tags + name + facts + context)
- `gateway.mode=local` is REQUIRED — without it OpenClaw exits immediately
