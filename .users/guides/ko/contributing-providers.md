# 프로바이더 추가 가이드 (LLM / STT / TTS)

Naia OS는 모든 AI 프로바이더에 레지스트리 패턴을 사용합니다. 새 프로바이더 추가 = 파일 1개 수정 — UI 변경 불필요.

## STT 프로바이더

### 1. 메타데이터 등록

`shell/src/lib/stt/registry.ts`에서 `registerSttProvider()` 호출:

```typescript
registerSttProvider({
  id: "my-stt",                     // 고유 ID (config.sttProvider 값과 일치)
  name: "My STT Service",
  description: "설정 UI에 표시할 짧은 설명.",
  engineType: "api",                // "tauri" | "api" | "web"
  isOffline: false,
  requiresApiKey: true,
  apiKeyConfigField: "myApiKey",    // Config의 키 필드명
  pricing: "$0.006/15s",
  supportedLanguages: ["ko-KR", "en-US"],
});
```

**engineType 값:**
- `"tauri"` — Rust 플러그인 (Vosk/Whisper). `sttModel` 필요.
- `"api"` — `api-stt.ts`의 `createApiSttSession()` 사용.
- `"web"` — 브라우저 Web Speech API (`createWebSpeechSttSession()`).

### 2. API 호출 구현 (api 타입만)

`shell/src/lib/stt/api-stt.ts`에 `transcribeMyService()` 함수 추가 후 `sendAndTranscribe()` 분기 추가:

```typescript
} else if (provider === "my-stt") {
  result = await transcribeMyService(base64, apiKey, language);
}
```

`ApiSttOptions.provider` 타입 유니온에 provider id 추가.

### 3. Config에 API 키 필드 추가 (필요한 경우)

`shell/src/lib/config.ts`의 `Config` 인터페이스에 `myApiKey?: string` 추가.

---

## TTS 프로바이더

### 1. 메타데이터 등록

`shell/src/lib/tts/registry.ts`에서 `registerTtsProviderMeta()` 호출:

```typescript
registerTtsProviderMeta({
  id: "my-tts",
  name: "My TTS Service",
  description: "짧은 설명.",
  requiresApiKey: true,
  apiKeyConfigField: "myTtsApiKey",
  pricing: "$0.01/1K 글자",
  voices: [
    { id: "voice-1", label: "Voice 1", gender: "female" },
  ],
  // 선택: API에서 음성 목록 동적 조회
  async fetchVoices(apiKey) {
    // TtsVoiceMeta[] | null 반환
  },
  // 선택: 브라우저 측 합성 (에이전트 파이프라인 우회)
  isClientSide: false,
});
```

### 2. 에이전트에서 합성 구현

`agent/src/index.ts`의 `handleTtsRequest()`에 새 provider ID 분기 추가.

### 3. `tts/cost.ts` 가격 업데이트

`FLAT_RATE_PER_CHAR` 또는 티어 가격 로직에 프로바이더 요율 추가.

---

## LLM 프로바이더

### Shell 측 (설정 UI)

`shell/src/lib/llm/registry.ts`에서 `LlmProviderMeta`로 `registerLlmProvider()` 호출.

### Agent 측 (모델 라우팅)

`agent/src/providers/factory.ts`에서 `LlmProviderDefinition`으로 `registerLlmProvider()` 호출 + 백엔드 `buildProvider()` 구현.

---

## 체크리스트

- [ ] 프로바이더 메타데이터 등록 (registry 파일)
- [ ] API 호출 / 합성 로직 구현
- [ ] Config에 API 키 필드 추가 (새 키 필요 시)
- [ ] `cost.ts` 가격 업데이트 (TTS/STT)
- [ ] 설정 UI에서 테스트 (자동 인식됨)
- [ ] `supportedLanguages` / `voices` 목록 추가
