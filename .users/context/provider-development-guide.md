# Provider Development Guide

How to add LLM, TTS, or STT providers to Naia OS.

## Architecture Overview

Naia OS uses a **dual-registry** architecture:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Shell registry** | `shell/src/lib/providers/` | UI metadata (name, configFields, capabilities) |
| **Agent registry** | `agent/src/providers/registry.ts` | Runtime implementations (LLM factories) |
| **OpenAI-compat factory** | `agent/src/providers/openai-compat.ts` | Shared factory for OpenAI-compatible providers |

The shell registry uses **composite keys** (`${type}:${id}`) to prevent ID collisions — for example, "nextain" exists as both an LLM and a TTS provider. The shell registry drives Settings UI rendering, while the agent registry handles actual API calls.

As of Issue #51: **8 LLM**, 5 TTS, 3 STT providers are registered.

### Registered Providers

**LLM** (verified — API keys in .env):
nextain, claude-code-cli, gemini, openai, anthropic, xai, zai, ollama

**TTS** (metadata defined, runtime integration planned):
edge, nextain, google, openai, elevenlabs

**STT** (metadata defined, runtime integration planned):
vosk, whisper, web-speech-api

## Adding an LLM Provider

### Option A: OpenAI-Compatible (Recommended)

Most LLM providers use the OpenAI-compatible API format. Use `createOpenAICompatProvider()` from `agent/src/providers/openai-compat.ts` for a streamlined setup — it handles streaming, tool call accumulation, and usage tracking automatically.

### Step 1: Shell-side metadata

Create `shell/src/lib/providers/llm/my-llm.ts`:

```typescript
import { defineProvider } from "../registry";

export const myLlmProvider = defineProvider({
  id: "my-llm",
  type: "llm",
  name: "My LLM",
  order: 10,
  capabilities: { requiresApiKey: true },
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
    },
  ],
  defaultModel: "my-model-v1",
  envVar: "MY_LLM_API_KEY",
  listModels: () => [
    { id: "my-model-v1", label: "My Model v1", type: "llm" },
    { id: "my-model-v2", label: "My Model v2 (Fast)", type: "llm" },
  ],
});
```

### Step 2: Register import

Add to `shell/src/lib/providers/llm/index.ts`:

```typescript
import "./my-llm";
```

### Step 3: Agent-side implementation

Create `agent/src/providers/my-llm.ts` implementing the `LLMProvider` interface.

For OpenAI-compatible APIs, use the shared factory:
```typescript
import { createOpenAICompatProvider } from "./openai-compat.js";
import type { LLMProvider, ProviderConfig } from "./types.js";

export function createMyLlmProvider(config: ProviderConfig): LLMProvider {
  return createOpenAICompatProvider({
    apiKey: config.apiKey || process.env["MY_LLM_API_KEY"] || "",
    model: config.model,
    baseUrl: "https://api.my-llm.com/v1",
  });
}
```

### Step 4: Register in agent

Add to `agent/src/providers/register.ts`:

```typescript
import { createMyLlmProvider } from "./my-llm.js";
registerLlm("my-llm", (config) => createMyLlmProvider(config));
```

### Step 5: Verify

1. Add `MY_LLM_API_KEY` to `.env`
2. Run unit tests: `pnpm test`
3. Run E2E: spec `80-provider-registry`

## Adding a TTS Provider

### Step 1: Shell-side metadata

Create `shell/src/lib/providers/tts/my-tts.ts`:

```typescript
import { defineProvider } from "../registry";

export const myTtsProvider = defineProvider({
  id: "my-tts",
  type: "tts",
  name: "My TTS Service",
  order: 10,
  capabilities: {
    requiresApiKey: true,
    runtime: "node",
  },
  configFields: [
    {
      key: "myTtsApiKey",
      label: "My TTS API Key",
      type: "password",
      required: true,
    },
  ],
  defaultVoice: "default-voice-id",
  listVoices: () => [
    { id: "voice-1", label: "Voice One (Female)", gender: "female" },
    { id: "voice-2", label: "Voice Two (Male)", gender: "male" },
  ],
});
```

### Step 2: Register import

Add to `shell/src/lib/providers/tts/index.ts`:
```typescript
import "./my-tts";
```

### Step 3: Agent-side implementation

Create `agent/src/tts/my-tts.ts`:
```typescript
export async function synthesizeMyTts(
  text: string, apiKey: string, voice?: string,
): Promise<string | null> {
  // Call TTS API, return base64-encoded MP3 or null
}
```

### Step 4: Register in agent

Add to `agent/src/tts/register.ts`:
```typescript
registerTts("my-tts", ({ text, voice, apiKey }) =>
  synthesizeMyTts(text, apiKey!, voice));
```

**Status:** TTS shell metadata is ready. Agent-side runtime integration is in progress.

## Adding an STT Provider

STT providers run in different runtimes:
- **Browser** (Web Speech API) — runs in WebView
- **Rust** (Vosk, Whisper) — native Tauri plugin

### Browser-based STT

Create `shell/src/lib/providers/stt/my-stt.ts` with `defineProvider()`, then add import to `stt/index.ts`.

### Rust-based STT

Extend the `tauri-plugin-stt` Rust plugin. Requires Rust + Tauri plugin experience.

**Status:** STT shell metadata is ready. Runtime integration is planned.

## Provider Interface Reference

### ProviderDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique ID (e.g., "openai", "edge") |
| `type` | `"llm" \| "stt" \| "tts"` | Yes | Provider category |
| `name` | `string` | Yes | Display name |
| `description` | `string` | No | Short description |
| `order` | `number` | No | Sort priority (lower = first, default 99) |
| `disabled` | `boolean` | No | Show but don't allow selection |
| `capabilities` | `ProviderCapabilities` | No | Feature flags |
| `configFields` | `ConfigField[]` | Yes | Settings UI fields |
| `listModels` | `() => ModelInfo[]` | LLM | Available models |
| `listVoices` | `(locale?) => VoiceInfo[]` | TTS | Available voices |
| `defaultModel` | `string` | LLM | Default model ID |
| `defaultVoice` | `string` | TTS | Default voice ID |
| `envVar` | `string` | LLM | Env var for API key fallback |
| `supportedLanguages` | `string[]` | STT | Supported language codes |

## Provider-Specific Know-How

### Edge TTS
- Free, no API key — ideal default
- Uses `msedge-tts` npm package
- 80+ multilingual neural voices

### Google Cloud TTS
- Gemini API key works as Google Cloud TTS key
- Neural2 voices for high quality

### OpenAI TTS
- Models: `tts-1` (fast), `tts-1-hd` (quality)
- 6 built-in voices: alloy, echo, fable, onyx, nova, shimmer

### ElevenLabs
- Multilingual model: `eleven_multilingual_v2`
- Flash model (0.5x cost): `eleven_flash_v2_5`

### Vosk (STT)
- CPU-friendly, ~50MB per language model
- Models stored in `~/.naia/stt-models/`

### Whisper (STT)
- GPU recommended for real-time
- Models: tiny, base, small, medium, large
