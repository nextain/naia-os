/** Options passed to a TTS provider's synthesize method. */
export interface TtsSynthesizeOptions {
	text: string;
	voice?: string;
	apiKey?: string;
	naiaKey?: string;
}

/** Result from TTS synthesis — audio + optional server-reported cost. */
export interface TtsSynthesizeResult {
	/** base64-encoded MP3 audio */
	audio: string;
	/** Actual cost in USD reported by the server (only Naia Cloud returns this). */
	costUsd?: number;
}

/** Metadata about a voice offered by a TTS provider. */
export interface TtsVoiceInfo {
	id: string;
	name: string;
	language?: string;
	gender?: "male" | "female" | "neutral";
}

/** TTS provider definition — one per provider file. */
export interface TtsProviderDefinition {
	/** Unique identifier matching TtsProviderId (e.g. "edge", "openai"). */
	id: string;
	/** Human-readable name for settings UI. */
	name: string;
	/** Whether this provider requires an API key to function. */
	requiresApiKey: boolean;
	/** Whether this provider requires a Naia Lab key specifically. */
	requiresNaiaKey?: boolean;

	/**
	 * Synthesize speech from text.
	 * @returns audio + optional cost, or null on failure.
	 */
	synthesize(options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult | null>;

	/** Optional: list available voices for this provider. */
	listVoices?(): TtsVoiceInfo[];
}
