// Import all built-in providers to trigger self-registration at module load.
// Adding a new TTS provider: create providers/{name}.ts, implement TtsProviderDefinition,
// call registerTtsProvider() at module scope, then add an import here.
import "./edge-tts.js";
import "./google-tts.js";
import "./openai-tts.js";
import "./elevenlabs-tts.js";
import "./nextain-tts.js";

export { synthesize, getTtsProvider, listTtsProviders } from "./registry.js";
export type {
	TtsProviderDefinition,
	TtsSynthesizeOptions,
	TtsVoiceInfo,
} from "./types.js";
