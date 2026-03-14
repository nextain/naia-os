# Contributing to Naia

## You don't need to ask anyone

```bash
git clone https://github.com/nextain/naia-os.git
cd naia-os
# Open with any AI coding tool (Claude Code, Cursor, Copilot, Gemini, etc.)
# Ask in your language: "What is this project and how can I help?"
```

The `.agents/` directory gives AI full project context. It will explain the vision, architecture, roadmap, and what you can work on — **in whatever language you speak**.

## Any language is welcome

Write issues, PRs, and comments in **any language**. Maintainers use AI translation.

Code, commits, and context files should be in English — but if you can't, submit anyway. We'll help.

## 10 ways to contribute

| # | Type | Difficulty | How |
|---|------|-----------|-----|
| 1 | **Translation** | Low | Add your language to `.users/context/{lang}/` |
| 2 | **Skill** | Medium | Create an AI skill in `agent/assets/default-skills/` |
| 3 | **New Feature** | High | Open an issue → discuss → implement |
| 4 | **Bug Report** | Low | Describe the bug → open an issue |
| 5 | **Code / PR** | Medium-High | Pick an issue → branch → code → test → PR |
| 6 | **Documentation** | Low-Medium | Improve docs in `.users/context/` |
| 7 | **Testing** | Low | Use the app and share feedback |
| 8 | **Design / UX / Assets** | Medium | UI/UX improvements, icons, VRM avatar models |
| 9 | **Security Report** | Medium-High | Report via [GitHub Security Advisory](https://github.com/nextain/naia-os/security/advisories) |
| 10 | **Context** | Medium | Improve `.agents/` context files — equal value to code |

## Getting started

### Prerequisites

- Linux (Bazzite, Ubuntu, Fedora, etc.)
- Node.js 22+, pnpm 9+
- Rust stable (for Tauri build)
- System packages (Fedora): `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel`
- cmake (for whisper.cpp build)

### Development run

```bash
cd shell && pnpm install
cd ../agent && pnpm install
cd ../shell && pnpm run tauri dev
```

### Tests

```bash
cd shell && pnpm test                # Shell unit tests
cd agent && pnpm test                # Agent unit tests
cargo test --manifest-path shell/src-tauri/Cargo.toml  # Rust tests
```

## Code contribution process

1. **Issue first** — Pick an existing issue or create a new one
2. **Branch** — `issue-{number}-{short-description}`
3. **Code** — Follow existing patterns. AI reads `.agents/context/agents-rules.json` for conventions.
4. **Test** — TDD preferred: write test → minimal code → refactor
5. **Context** — If your change affects architecture, update `.agents/` + `.users/` in the same PR
6. **PR** — Title: `type(scope): description` (e.g., `feat(agent): add weather skill`)

### PR checklist

- [ ] Tests included (new code requires new tests)
- [ ] Tests pass (`pnpm test`)
- [ ] App actually runs (not just type-check)
- [ ] Context files updated if needed (`.agents/` + `.users/`)
- [ ] License headers on new files
- [ ] Commit messages in English

### One PR = code + tests + context

Never submit code without tests. If your change affects architecture or workflows, include context file updates in the same PR.

### PR size

Under 20 files recommended. Smaller PRs get reviewed faster.

## AI usage

AI usage is welcome and encouraged. If you used an AI tool, adding an `Assisted-by` trailer to your commit is appreciated (but not required):

```
feat(agent): add weather skill

Implement weather query skill using OpenWeatherMap API.

Assisted-by: Claude Code
```

## Context contributions

Context contributions (`.agents/` files) are valued **equally** to code contributions. One good context file prevents 100 low-quality AI PRs.

When editing context:
1. Edit `.agents/` (YAML/JSON, English)
2. Mirror to `.users/context/` (Markdown, English)
3. Mirror to `.users/context/ko/` (Markdown, Korean)
4. Keep `SPDX-License-Identifier: CC-BY-SA-4.0` headers

## Language principle

| Scope | Language |
|-------|----------|
| Issues, PR descriptions | Any language welcome |
| Code, commits, context files | English |
| Work-logs (personal notes) | Your preferred language (tip: keep in a separate private repo) |

## Adding a STT/TTS Provider

Naia uses an extensible **provider registry pattern** for STT and TTS. Adding a new provider is one of the easiest ways to contribute.

### Architecture overview

```
Voice interaction depends on LLM model type:
- Omni models (Gemini Live, OpenAI Realtime): voice I/O built into LLM
- Standard LLM models: independent STT → LLM → TTS pipeline
```

STT, TTS, and LLM providers are **three independent categories**. When an omni model is active, STT/TTS providers are disabled.

### Adding a TTS provider (5 steps)

1. **Create provider file** — `agent/src/tts/{name}.ts`

```typescript
import { registerTtsProvider } from "./registry.js";

export async function synthesizeSpeech(
  text: string, apiKey?: string, voice?: string
): Promise<string | null> {
  // Call your TTS API, return base64-encoded MP3 or null
}

registerTtsProvider({
  id: "my-provider",
  name: "My TTS Provider",
  requiresApiKey: true,
  synthesize: (opts) => synthesizeSpeech(opts.text, opts.apiKey, opts.voice),
});
```

2. **Register import** — Add `import "./my-provider.js";` in `agent/src/tts/index.ts`

3. **Add UI metadata** — In `shell/src/lib/tts/registry.ts`:

```typescript
registerTtsProviderMeta({
  id: "my-provider",
  name: "My TTS Provider",
  description: "Description for settings UI.",
  requiresApiKey: true,
  apiKeyConfigField: "myProviderApiKey",  // matches AppConfig field
  voices: [
    { id: "voice-1", label: "Voice One", gender: "female" },
    { id: "voice-2", label: "Voice Two", gender: "male" },
  ],
});
```

4. **Add config field** — In `shell/src/lib/config.ts`, add your API key field to `AppConfig`

5. **Test** — See testing section below

### Adding a STT provider

Two types of STT providers:

**Offline (Tauri plugin)** — runs locally, no API key:
1. Implement engine in `shell/src-tauri/plugins/tauri-plugin-stt/src/desktop.rs`
2. Register metadata in `shell/src/lib/stt/registry.ts` with `engineType: "tauri"`
3. Add model entries in `shell/src-tauri/src/stt_models.rs`

**API-based (cloud)** — requires API key, runs via browser MediaStream:
1. Add transcription function in `shell/src/lib/stt/api-stt.ts`
2. Register metadata in `shell/src/lib/stt/registry.ts` with `engineType: "api"`
3. Add route in `ChatPanel.tsx` API STT branch

### Testing your provider

After adding a provider, run the full test suite to verify it works end-to-end.

**Step 1: Unit tests** — Registry registration + UI rendering:
```bash
cd shell && pnpm test    # SettingsTab renders your provider in dropdown
cd agent && pnpm test    # Agent registers your provider
```

**Step 2: Voice validity** — Verify voices produce actual audio:
```bash
cd agent && OPENAI_API_KEY=... pnpm exec vitest run src/__tests__/tts-voice-validity.test.ts
```

**Step 3: E2E — Settings UI** — Provider switching, API key, voice picker:
```bash
cd shell && source ../my-envs/naia-os-shell.env
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/76-tts-provider-switching.spec.ts
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/77-stt-provider-switching.spec.ts
```

**Step 4: E2E — Real API preview** — Enter API key, click preview, hear audio:
```bash
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/80-tts-preview-all-providers.spec.ts
```

**Step 5: E2E — Chat + TTS pipeline** — Send message, verify TTS audio plays:
```bash
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/81-chat-tts-response.spec.ts
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/84-chat-tts-per-provider.spec.ts
```

**Step 6: E2E — Actual recording + voice pipeline** — Real MediaRecorder + STT init:
```bash
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/85-voice-actual-recording.spec.ts
```
This test verifies: WebKitGTK MediaRecorder support, mic permission, STT initialization,
voice button state transitions, and TTS audio in chat. Uses real microphone access.

**Step 6: E2E — STT→LLM→TTS pipeline** (Playwright, mock-based):
```bash
npx playwright test e2e/pipeline-voice.spec.ts
```

### Full test suite (104+ tests)

| Test | Type | Count | What it covers |
|------|------|-------|----------------|
| `76-tts-provider-switching` | Tauri E2E | 12 | TTS dropdown, API key, voice, Edge preview |
| `77-stt-provider-switching` | Tauri E2E | 7 | STT dropdown, order (free→Naia→paid), API key |
| `78-voice-pipeline-mode` | Tauri E2E | 11 | UI labels, voice picker, button states, 🗣️ icon |
| `79-pipeline-voice-activation` | Tauri E2E | 9 | Voice button lifecycle, CSS 3-state |
| `80-tts-preview-all-providers` | Tauri E2E | 5 | Real API key preview: Edge/OpenAI/Google/ElevenLabs |
| `81-chat-tts-response` | Tauri E2E | 9 | Chat → AI response → TTS audio playback |
| `82-chat-tts-multi-model` | Tauri E2E | 6 | Model switching preserves TTS |
| `83-tts-per-model-verification` | Tauri E2E | 15 | 5 LLM providers × model: chat + TTS |
| `84-chat-tts-per-provider` | Tauri E2E | 12 | 4 TTS providers: UI key input → save → chat |
| `85-voice-actual-recording` | Tauri E2E | 7 | Real MediaRecorder, mic access, STT init, voice button |
| `pipeline-voice` | Playwright | 10 | STT mock → LLM → TTS, debounce, interrupt, Whisper |
| `tts-voice-validity` | Vitest | 17+ | All registered voices produce audio |

### Key files

| File | Purpose |
|------|---------|
| `agent/src/tts/types.ts` | `TtsProviderDefinition` interface |
| `agent/src/tts/registry.ts` | Runtime registry (Map-based, self-registration) |
| `shell/src/lib/tts/types.ts` | `TtsProviderMeta` for Settings UI (+ `fetchVoices()`) |
| `shell/src/lib/tts/registry.ts` | UI metadata registry with pricing |
| `shell/src/lib/tts/cost.ts` | Per-request TTS cost estimation |
| `shell/src/lib/stt/types.ts` | `SttProviderMeta` + `SttSession` interface |
| `shell/src/lib/stt/registry.ts` | STT metadata registry (offline + API) |
| `shell/src/lib/stt/api-stt.ts` | API-based STT (Google/ElevenLabs/Naia Cloud) |
| `shell/src/components/SettingsTab.tsx` | Auto-discovers providers from registry |
| `agent/src/skills/built-in/tts.ts` | Preview action (all 5 providers) |

### Testing principle: UI vs actual operation

E2E tests must verify **actual operation**, not just UI elements:

| Level | What to check | Example |
|-------|--------------|---------|
| **UI only** (insufficient) | dropdown exists, no error CSS | "select has options" |
| **Actual operation** (required) | real API call succeeds, audio data received | "MediaRecorder created, STT initialized, audio base64 > 0" |

- **Spec 85** tests actual MediaRecorder creation + mic access + STT init — this catches WebKitGTK compatibility issues
- **Spec 80** tests real API key preview — actual TTS audio generation
- **Spec 84** tests real chat + TTS — actual LLM response with TTS enabled
- Always check **logs** for errors, not just absence of UI error elements

### Voice list guidelines

- **Verify voices** against official API docs before adding
- **Use `fetchVoices()`** — implement runtime fetching if the API supports listing voices
- **Add pricing** — include `pricing` field in provider metadata
- **Test every voice** produces actual audio before release
- **Run E2E** — at minimum specs 80, 84, 85 must pass with your provider

## Development workflow

For feature-level work, we follow **issue-driven development**:

```
ISSUE → UNDERSTAND → SCOPE → INVESTIGATE → PLAN → BUILD → REVIEW → E2E TEST → SYNC → COMMIT
```

Details: [`.agents/workflows/issue-driven-development.yaml`](.agents/workflows/issue-driven-development.yaml)

## Translation

Want to help translate? See [TRANSLATING.md](TRANSLATING.md) for the full guide — locale codes, file locations, scope, and how to submit.

Quick start: [Issue #8](https://github.com/nextain/naia-os/issues/8)

## Rewards

Naia OS is an early-stage open source project. We do not have a bounty or reward program at this time — all contributions are volunteer work.

We genuinely appreciate every contribution. As the project and company grow, we plan to explore contributor reward programs in the future.

## License

- **Source code**: [Apache License 2.0](LICENSE)
- **AI context** (`.agents/`, `.users/`, `AGENTS.md`): [CC-BY-SA 4.0](CONTEXT-LICENSE)

By contributing, you agree to these terms.
