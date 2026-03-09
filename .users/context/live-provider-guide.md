# Adding a New Live Voice Provider

> Guide for contributors who want to add a new real-time voice conversation provider to Naia.

## Prerequisites

- The provider must support **native end-to-end speech-to-speech** via WebSocket
- STT+TTS pipeline providers are NOT accepted (see design philosophy in architecture docs)
- The provider must accept PCM audio input and produce PCM audio output

## Step-by-Step

### 1. Register the Provider ID

**File:** `shell/src/lib/voice/types.ts`

```typescript
// Add to LiveProviderId union
export type LiveProviderId = "gemini-live" | "openai-realtime" | "moshi" | "your-provider";

// Add label
export const LIVE_PROVIDER_LABELS: Record<LiveProviderId, string> = {
  "gemini-live": "Gemini Live",
  "openai-realtime": "OpenAI Realtime",
  moshi: "Moshi (Local)",
  "your-provider": "Your Provider Name",
};
```

### 2. Define the Provider Config

**File:** `shell/src/lib/voice/types.ts`

```typescript
export interface YourProviderConfig extends LiveProviderConfigBase {
  provider: "your-provider";
  // Add provider-specific fields (API key, server URL, etc.)
  apiKey?: string;
}

// Add to discriminated union
export type LiveProviderConfig =
  | GeminiLiveConfig
  | OpenAIRealtimeConfig
  | MoshiConfig
  | YourProviderConfig;
```

### 3. Implement VoiceSession

**File:** `shell/src/lib/voice/your-provider.ts`

Create a file that exports a function returning `VoiceSession`:

```typescript
import type { VoiceSession, YourProviderConfig, LiveProviderConfig } from "./types";
import { Logger } from "../logger";

export function createYourProviderSession(): VoiceSession {
  let ws: WebSocket | null = null;

  const session: VoiceSession = {
    isConnected: false,

    async connect(config: LiveProviderConfig) {
      const cfg = config as YourProviderConfig;
      // 1. Create WebSocket connection
      // 2. Set up message handlers
      // 3. Send setup/handshake if needed
      // 4. Set isConnected = true when ready
    },

    sendAudio(pcmBase64: string) {
      // Send audio to provider (base64 PCM or convert to provider's format)
    },

    sendText(text: string) {
      // Send text input if provider supports it
    },

    sendToolResponse(callId: string, result: unknown) {
      // Send tool call response if provider supports it
    },

    disconnect() {
      ws?.close();
      ws = null;
      (session as any).isConnected = false;
      session.onDisconnect?.();
    },

    // Events — set to null, ChatPanel will assign handlers
    onAudio: null,
    onInputTranscript: null,
    onOutputTranscript: null,
    onToolCall: null,
    onTurnEnd: null,
    onInterrupted: null,
    onError: null,
    onDisconnect: null,
  };

  return session;
}
```

**Key patterns to follow:**
- Audio is always **base64-encoded PCM** in our interface. If the provider uses binary frames, convert in your adapter (see `moshi.ts` for example).
- Call `session.onAudio?.(base64)` when receiving audio from the provider.
- Call `session.onTurnEnd?.()` when the provider signals turn completion.
- Call `session.onError?.(new Error(...))` on errors, then optionally disconnect.
- Use `Logger` (not `console.log`) for all logging.

### 4. Register in Factory

**File:** `shell/src/lib/voice/index.ts`

```typescript
import { createYourProviderSession } from "./your-provider";

export function createVoiceSession(provider: LiveProviderId): VoiceSession {
  switch (provider) {
    case "gemini-live":
      return createGeminiLiveSession();
    case "openai-realtime":
      return createOpenAIRealtimeSession();
    case "moshi":
      return createMoshiSession();
    case "your-provider":
      return createYourProviderSession();
    default:
      throw new Error(`Unknown live provider: ${provider}`);
  }
}
```

### 5. Add Config Fields (if needed)

**File:** `shell/src/lib/config.ts` — Add provider-specific config fields (API keys, server URLs).

**File:** `shell/src/lib/secure-store.ts` — Add API key names to `SECRET_KEYS` if the provider requires secrets.

**File:** `shell/src/lib/lab-sync.ts` — Add non-secret config fields to `LAB_SYNC_FIELDS` if they should sync to Lab.

### 6. Add Settings UI

**File:** `shell/src/components/SettingsTab.tsx`

Add conditional settings (API key input, server URL, etc.) under the Voice Conversation section, similar to existing providers.

### 7. Add ChatPanel Config Building

**File:** `shell/src/components/ChatPanel.tsx`

In `handleVoiceToggle()`, add a case for your provider to build the correct `LiveProviderConfig`.

### 8. Write Tests

**File:** `shell/src/lib/voice/__tests__/your-provider.test.ts`

Test at minimum:
- Session creation (returns VoiceSession with correct initial state)
- Connect flow (WebSocket creation, setup handshake)
- Audio sending/receiving
- Disconnect behavior
- Error handling

See existing test files for patterns. All tests use a mock `WebSocket` global.

### 9. Update Context

After implementation, update these context files (triple mirror):
- `.agents/context/architecture.yaml` → `voice_architecture.live_providers`
- `.users/context/architecture.md` → Voice Architecture section
- `.users/context/ko/architecture.md` → Korean mirror

## Audio Format Reference

| Direction | Format | Sample Rate | Encoding |
|-----------|--------|-------------|----------|
| Mic → Provider | base64 PCM | 16kHz | Int16 mono |
| Provider → Speaker | base64 PCM | 24kHz | Int16 mono |

`mic-stream.ts` and `audio-player.ts` handle capture/playback. They are provider-agnostic — do NOT modify them for a new provider.

## Comparison with AIRI Project

[AIRI](https://github.com/moeru-ai/airi) takes a different approach:

| Aspect | Naia | AIRI |
|--------|------|------|
| **Voice architecture** | Native Live API only (end-to-end speech-to-speech) | STT + LLM + TTS pipeline |
| **Provider abstraction** | Single `VoiceSession` interface for all Live providers | Separate STT and TTS provider ecosystems |
| **Supported providers** | Gemini Live, OpenAI Realtime, Moshi | Multiple STT providers + multiple TTS providers |
| **Latency** | Low (~160ms local, ~500ms cloud) | Higher (STT + LLM + TTS chain) |
| **Flexibility** | Lower (requires native Live API support) | Higher (any STT + any LLM + any TTS) |
| **Open-source local** | Moshi (full-duplex native) | Whisper STT + various local TTS |

Naia deliberately chose the native-only approach for UX quality. The STT+TTS pipeline, while more flexible, produces noticeably worse conversational experience due to accumulated latency and loss of prosody.
