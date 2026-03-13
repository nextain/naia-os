/** STT engine identifier — maps to Rust implementation in tauri-plugin-stt. */
export type SttEngineId = "vosk" | "whisper";

/** STT provider metadata for settings UI and runtime selection. */
export interface SttProviderMeta {
	/** Unique identifier (same as SttProviderId in config.ts). */
	id: string;
	/** Human-readable name. */
	name: string;
	/** Brief description for settings UI. */
	description: string;
	/** Which Rust engine to use. */
	engine: SttEngineId;
	/** Whether this runs entirely offline. */
	isOffline: boolean;
	/** Whether GPU acceleration is available/beneficial. */
	gpuAccelerated?: boolean;
	/** Supported language codes (BCP-47). */
	supportedLanguages: string[];
}

/** STT model metadata for download/selection UI. */
export interface SttModelMeta {
	/** Model identifier (e.g. "vosk-model-small-ko-0.22", "whisper-base"). */
	id: string;
	/** Which provider owns this model. */
	providerId: string;
	/** Human-readable name. */
	name: string;
	/** Download size (human-readable, e.g. "82MB"). */
	size: string;
	/** Word Error Rate (approximate). */
	wer?: string;
	/** Languages this model supports. */
	languages: string[];
	/** Whether GPU is recommended for real-time performance. */
	gpuRecommended?: boolean;
}
