# Changelog

All notable changes to Naia OS are documented here.
Source data: [`releases/v*.yaml`](releases/)

[한국어 (Korean)](CHANGELOG.ko.md)

---

## v0.1.2 (2026-03-10)

In-app auto-update, voice provider refactoring, skill/voice bug fixes, CI quality gates, and OS improvements

- **feat(shell)**: In-app update checker with banner notification and Settings version footer ([#30](https://github.com/nextain/naia-os/issues/30))
- **feat(ci)**: Tauri updater signing, latest.json generation, and itch.io butler push ([#30](https://github.com/nextain/naia-os/issues/30))
- **feat(web)**: Changelog section on naia.nextain.io download page from releases/*.yaml ([#30](https://github.com/nextain/naia-os/issues/30))
- **feat(voice)**: Abstract live conversation into provider pattern (Gemini Live, OpenAI Realtime) ([#25](https://github.com/nextain/naia-os/issues/25))
- **fix(shell)**: Suppress echo in voice conversation and add VRM gender-based voice defaults ([#22](https://github.com/nextain/naia-os/issues/22))
- **refactor(shell)**: Remove dead STT code and legacy SettingsModal ([#25](https://github.com/nextain/naia-os/issues/25))
- **fix(agent)**: Fix AI failing to discover custom skills in non-English locales ([#28](https://github.com/nextain/naia-os/issues/28))
- **fix(skills)**: Fix skill install feedback, event leak, i18n, and sync 20 built-in skills ([#28](https://github.com/nextain/naia-os/issues/28))
- **refactor(agent)**: Deduplicate system prompt pipeline
- **feat(agent)**: Configurable Ollama host
- **feat(shell)**: Dual-origin memory sync between Shell and OpenClaw
- **fix(shell)**: Make AI response language follow locale setting
- **feat(ci)**: CI quality gates (lint, typecheck, build-test) with Biome enforcement ([#12](https://github.com/nextain/naia-os/issues/12))
- **feat(ci)**: Chain pipeline: Release → Build OS → Generate ISO, weekly auto-rebuild ([#12](https://github.com/nextain/naia-os/issues/12))
- **fix(installer)**: Restore DNS triple fallback, CJK font fix, Plymouth two-step module
- **fix(branding)**: Add taskbar pins, wallpaper, lock screen for installed system

## v0.1.1 (2026-03-05)

First public release with Flatpak support and OpenClaw integration

- **feat(shell)**: Flatpak packaging with OpenClaw bundled
- **feat(shell)**: VRM 3D avatar with emotion expressions
- **feat(agent)**: Multi-provider LLM support (Gemini, Claude, OpenAI, xAI, Ollama)
- **feat(shell)**: TTS voice chat with Edge, Google, OpenAI, ElevenLabs
- **feat(shell)**: 14-language UI localization ([#1](https://github.com/nextain/naia-os/issues/1))
