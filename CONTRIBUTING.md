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

STT engines run in **Rust** (`tauri-plugin-stt`). The TypeScript registry holds metadata only.

1. Implement engine in `shell/src-tauri/plugins/tauri-plugin-stt/src/desktop.rs`
2. Register metadata in `shell/src/lib/stt/registry.ts`
3. Add model entries in `shell/src-tauri/src/stt_models.rs`

### Testing your provider

**Unit test** — Verify registry registration:
```bash
cd agent && pnpm test  # Checks TTS provider is registered
cd shell && pnpm test  # Checks UI metadata is registered
```

**E2E test** — Run the provider switching test:
```bash
cd shell && source ../my-envs/naia-os-shell.env  # Load API keys
npx wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/76-tts-provider-switching.spec.ts
```

This test verifies: provider dropdown → API key input → voice selection → audio preview.

**Voice validation** — Test that voices actually produce audio:
```bash
cd agent && OPENAI_API_KEY=... pnpm exec vitest run src/__tests__/tts-preview-e2e.test.ts
```

### Key files

| File | Purpose |
|------|---------|
| `agent/src/tts/types.ts` | `TtsProviderDefinition` interface |
| `agent/src/tts/registry.ts` | Runtime registry (Map-based, self-registration) |
| `shell/src/lib/tts/types.ts` | `TtsProviderMeta` for Settings UI |
| `shell/src/lib/tts/registry.ts` | UI metadata registry |
| `shell/src/lib/stt/registry.ts` | STT metadata registry |
| `shell/src/components/SettingsTab.tsx` | Auto-discovers providers from registry |
| `shell/e2e-tauri/specs/76-tts-provider-switching.spec.ts` | E2E test |

### Voice list guidelines

- **Verify voices** against official API docs before adding
- **Mark model-specific voices** (e.g., "gpt-4o-mini-tts only")
- **No hardcoded dynamic lists** — if the API supports `listVoices()`, prefer runtime fetching
- **Test every voice** produces actual audio before release

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
