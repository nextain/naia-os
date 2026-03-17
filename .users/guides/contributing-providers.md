# Adding a Provider (LLM / STT / TTS)

Naia OS uses a registry pattern for all AI providers. Adding a new provider is a single-file operation — no UI changes needed.

## STT Provider

### 1. Register metadata

In `shell/src/lib/stt/registry.ts`, call `registerSttProvider()`:

```typescript
registerSttProvider({
  id: "my-stt",                     // unique ID (matches config.sttProvider)
  name: "My STT Service",
  description: "Brief description for settings UI.",
  engineType: "api",                // "tauri" | "api" | "web"
  isOffline: false,
  requiresApiKey: true,
  apiKeyConfigField: "myApiKey",    // key name in Config
  pricing: "$0.006/15s",
  supportedLanguages: ["ko-KR", "en-US"],
});
```

**engineType values:**
- `"tauri"` — Rust plugin (Vosk/Whisper). Requires `sttModel`.
- `"api"` — Cloud API via `createApiSttSession()` in `api-stt.ts`.
- `"web"` — Browser Web Speech API via `createWebSpeechSttSession()`.

### 2. Implement the API call (api engineType only)

In `shell/src/lib/stt/api-stt.ts`, add a `transcribeMyService()` function and add a branch in `sendAndTranscribe()`:

```typescript
} else if (provider === "my-stt") {
  result = await transcribeMyService(base64, apiKey, language);
}
```

Add the provider id to `ApiSttOptions.provider` type union.

### 3. Add the API key field to Config (if needed)

In `shell/src/lib/config.ts`, add `myApiKey?: string` to the `Config` interface and default.

---

## TTS Provider

### 1. Register metadata

In `shell/src/lib/tts/registry.ts`, call `registerTtsProviderMeta()`:

```typescript
registerTtsProviderMeta({
  id: "my-tts",
  name: "My TTS Service",
  description: "Brief description.",
  requiresApiKey: true,
  apiKeyConfigField: "myTtsApiKey",
  pricing: "$0.01/1K chars",
  voices: [
    { id: "voice-1", label: "Voice 1", gender: "female" },
  ],
  // Optional: fetch voices from API
  async fetchVoices(apiKey) {
    // return TtsVoiceMeta[] | null
  },
  // Optional: browser-side synthesis (bypasses agent pipeline)
  isClientSide: false,
});
```

### 2. Implement synthesis in the agent

In `agent/src/index.ts`, add a branch in `handleTtsRequest()` for the new provider ID.

### 3. Update `tts/cost.ts` pricing

Add the provider's rate to `FLAT_RATE_PER_CHAR` or the tier pricing logic.

---

## LLM Provider

### Shell side (settings UI)

In `shell/src/lib/llm/registry.ts`, call `registerLlmProvider()` with `LlmProviderMeta`.

### Agent side (model routing)

In `agent/src/providers/factory.ts`, add `registerLlmProvider()` with `LlmProviderDefinition` and implement `buildProvider()` for your backend.

---

## Checklist

- [ ] Register provider metadata (registry file)
- [ ] Implement API call / synthesis logic
- [ ] Add API key field to Config (if new key needed)
- [ ] Update `cost.ts` pricing (TTS/STT)
- [ ] Test in settings UI (auto-discovered automatically)
- [ ] Add provider to `supportedLanguages` / `voices` list
