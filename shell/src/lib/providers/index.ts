/**
 * Provider registry — public API.
 *
 * Usage:
 *   import { listProviders, getProvider } from "../providers";
 *   const ttsProviders = listProviders("tts");
 *   const openai = getProvider("openai", "llm");
 *
 * Provider modules auto-register when imported.
 * Import provider index files to populate the registry:
 *   import "../providers/llm";  // registers all LLM providers
 *   import "../providers/tts";  // registers all TTS providers
 *   import "../providers/stt";  // registers all STT providers
 */

export type {
	ConfigField,
	ConfigFieldOption,
	ModelInfo,
	ProviderCapabilities,
	ProviderDefinition,
	ProviderType,
	VoiceInfo,
} from "./types";

export {
	clearRegistry,
	defineProvider,
	getProvider,
	getProviderIds,
	hasProvider,
	listProviders,
} from "./registry";
