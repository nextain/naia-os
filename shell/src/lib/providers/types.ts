/**
 * Provider registry types — shared interfaces for LLM, STT, TTS providers.
 *
 * Inspired by project-airi's defineProvider() pattern, simplified for Naia OS.
 * Each provider is a single file that calls defineProvider() to self-register.
 */

// ── Provider Types ──

export type ProviderType = "llm" | "stt" | "tts";

// ── Config Field (drives dynamic Settings UI) ──

export interface ConfigFieldOption {
	label: string;
	value: string;
}

export interface ConfigField {
	/** Key in the provider config object (e.g. "apiKey", "baseUrl") */
	key: string;
	/** Display label */
	label: string;
	/** Input type for Settings UI rendering */
	type: "text" | "password" | "select" | "toggle";
	/** Whether the field is required for the provider to work */
	required?: boolean;
	/** Placeholder text */
	placeholder?: string;
	/** Options for "select" type */
	options?: ConfigFieldOption[];
	/** UI section grouping */
	section?: "basic" | "advanced";
	/** Help text / description */
	description?: string;
}

// ── Model & Voice Info ──

export interface ModelInfo {
	id: string;
	label: string;
	/** "llm" = text-only, "omni" = voice-integrated (live) */
	type: "llm" | "omni";
	/** Whether user can select a voice for this model */
	voiceSelectable?: boolean;
	/** Available voices (omni models only) */
	voices?: { id: string; label: string }[];
	/** Whether the model provides its own input transcript */
	transcriptProvided?: boolean;
}

export interface VoiceInfo {
	id: string;
	label: string;
	/** Locale code (e.g. "ko-KR", "en-US") */
	locale?: string;
	/** Gender hint for avatar defaults */
	gender?: "male" | "female" | "neutral";
}

// ── Provider Capabilities ──

export interface ProviderCapabilities {
	/** Requires an API key to function */
	requiresApiKey?: boolean;
	/** Requires GPU for acceptable performance */
	requiresGpu?: boolean;
	/** GPU recommended but not required */
	gpuRecommended?: boolean;
	/** Requires downloading a model file */
	requiresModel?: boolean;
	/** Only works in browser (not native) */
	browserOnly?: boolean;
	/** Runtime environment */
	runtime?: "node" | "rust" | "browser";
}

// ── Provider Definition ──

export interface ProviderDefinition {
	/** Unique provider identifier (e.g. "openai", "edge", "vosk") */
	id: string;
	/** Provider category */
	type: ProviderType;
	/** Display name (e.g. "OpenAI", "Edge TTS", "Vosk") */
	name: string;
	/** Short description */
	description?: string;
	/** Provider capabilities */
	capabilities?: ProviderCapabilities;
	/** Config fields for Settings UI */
	configFields: ConfigField[];
	/** Whether this provider is disabled (shown but not selectable) */
	disabled?: boolean;
	/** Sorting order (lower = first, default 99) */
	order?: number;

	// ── LLM-specific ──

	/** Available models for this LLM provider */
	listModels?: () => ModelInfo[];
	/** Default model ID */
	defaultModel?: string;
	/** Env var name for API key fallback (agent-side, e.g. "OPENAI_API_KEY") */
	envVar?: string;

	// ── TTS-specific ──

	/** Available voices, optionally filtered by locale */
	listVoices?: (locale?: string) => VoiceInfo[];
	/** Default voice ID */
	defaultVoice?: string;

	// ── STT-specific ──

	/** Supported language codes */
	supportedLanguages?: string[];
}
