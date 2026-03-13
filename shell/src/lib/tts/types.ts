/** TTS provider metadata for settings UI auto-discovery. */
export interface TtsProviderMeta {
	/** Unique identifier matching agent-side TtsProviderId. */
	id: string;
	/** Human-readable name. */
	name: string;
	/** Brief description for settings UI. */
	description: string;
	/** Whether this provider requires an API key. */
	requiresApiKey: boolean;
	/** Config key for the API key (e.g. "openaiTtsApiKey", "elevenlabsApiKey"). */
	apiKeyConfigField?: string;
	/** Whether this provider requires a Naia Lab key. */
	requiresNaiaKey?: boolean;
	/** Whether the provider is free to use. */
	isFree?: boolean;
	/** Available voices for this provider. */
	voices?: TtsVoiceMeta[];
}

/** TTS voice metadata. */
export interface TtsVoiceMeta {
	id: string;
	label: string;
	language?: string;
	gender?: "male" | "female" | "neutral";
}
