# 프로바이더 개발 가이드

Naia OS에 LLM, TTS, STT 프로바이더를 추가하는 방법.

## 아키텍처 개요

Naia OS는 **이중 레지스트리** 아키텍처를 사용합니다:

| 레이어 | 위치 | 용도 |
|--------|------|------|
| **Shell 레지스트리** | `shell/src/lib/providers/` | UI 메타데이터 (이름, 설정 필드, 기능) |
| **Agent 레지스트리** | `agent/src/providers/registry.ts` | 런타임 구현 (LLM 팩토리) |
| **OpenAI 호환 팩토리** | `agent/src/providers/openai-compat.ts` | OpenAI 호환 프로바이더용 공유 팩토리 |

Shell 레지스트리는 **복합 키** (`${type}:${id}`)를 사용하여 ID 충돌을 방지합니다 — 예: "nextain"은 LLM과 TTS 프로바이더로 동시에 존재합니다.

Issue #51 기준: **LLM 8개**, TTS 5개, STT 3개 등록.

### 등록된 프로바이더

**LLM** (검증됨 — .env에 API 키 보유):
nextain, claude-code-cli, gemini, openai, anthropic, xai, zai, ollama

**TTS** (메타데이터 정의 완료, 런타임 통합 진행 중):
edge, nextain, google, openai, elevenlabs

**STT** (메타데이터 정의 완료, 런타임 통합 계획 중):
vosk, whisper, web-speech-api

## LLM 프로바이더 추가

### 옵션 A: OpenAI 호환 (권장)

대부분의 LLM 프로바이더는 OpenAI 호환 API를 사용합니다. `agent/src/providers/openai-compat.ts`의 `createOpenAICompatProvider()`를 사용하면 스트리밍, 도구 호출, 사용량 추적을 자동으로 처리합니다.

### 단계 1: Shell 메타데이터

`shell/src/lib/providers/llm/{name}.ts` 생성:

```typescript
import { defineProvider } from "../registry";

export const myLlmProvider = defineProvider({
  id: "my-llm",
  type: "llm",
  name: "My LLM",
  order: 10,
  capabilities: { requiresApiKey: true },
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", required: true },
  ],
  defaultModel: "my-model-v1",
  envVar: "MY_LLM_API_KEY",
  listModels: () => [
    { id: "my-model-v1", label: "My Model v1", type: "llm" },
  ],
});
```

### 단계 2: import 등록

`shell/src/lib/providers/llm/index.ts`에 추가:
```typescript
import "./my-llm";
```

### 단계 3: Agent 구현

OpenAI 호환 API는 공유 팩토리 사용:
```typescript
import { createOpenAICompatProvider } from "./openai-compat.js";

export function createMyLlmProvider(config) {
  return createOpenAICompatProvider({
    apiKey: config.apiKey || process.env["MY_LLM_API_KEY"] || "",
    model: config.model,
    baseUrl: "https://api.my-llm.com/v1",
  });
}
```

### 단계 4: Agent 등록

`agent/src/providers/register.ts`에 추가:
```typescript
registerLlm("my-llm", (config) => createMyLlmProvider(config));
```

### 단계 5: 검증

1. `.env`에 `MY_LLM_API_KEY` 추가
2. 유닛 테스트: `pnpm test`
3. E2E: spec `80-provider-registry` 실행

## TTS 프로바이더 추가

1. `shell/src/lib/providers/tts/{name}.ts`에 `defineProvider()` 메타데이터 + `listVoices()` 작성
2. `tts/index.ts`에 import 추가
3. `agent/src/tts/{name}.ts`에 합성 함수 구현 (텍스트 → base64 MP3)
4. `agent/src/tts/register.ts`에 등록

**상태:** Shell 메타데이터 준비 완료. Agent 런타임 통합 진행 중.

## STT 프로바이더 추가

- **브라우저**: `defineProvider()` 메타데이터만 추가
- **Rust**: `tauri-plugin-stt` 플러그인 확장 (Rust 경험 필요)

**상태:** Shell 메타데이터 준비 완료. 런타임 통합 계획 중.

## 프로바이더 인터페이스 참조

### ProviderDefinition

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `id` | `string` | ✅ | 고유 ID |
| `type` | `"llm" \| "stt" \| "tts"` | ✅ | 프로바이더 카테고리 |
| `name` | `string` | ✅ | 표시 이름 |
| `order` | `number` | | 정렬 우선순위 (낮을수록 먼저) |
| `capabilities` | `ProviderCapabilities` | | 기능 플래그 |
| `configFields` | `ConfigField[]` | ✅ | Settings UI 필드 |
| `listModels` | `() => ModelInfo[]` | LLM | 사용 가능 모델 |
| `listVoices` | `(locale?) => VoiceInfo[]` | TTS | 사용 가능 음성 |
| `envVar` | `string` | LLM | API 키 환경변수 이름 |

## 프로바이더별 참고사항

- **Edge TTS**: 무료, API 키 불필요, 80+ 다국어 음성
- **Google Cloud TTS**: Gemini API 키 사용 가능
- **OpenAI TTS**: tts-1 (빠름), tts-1-hd (고품질)
- **ElevenLabs**: eleven_multilingual_v2, flash 0.5x 비용
- **Vosk**: CPU 친화적, 언어당 ~50MB
- **Whisper**: GPU 권장, tiny~large 모델
