import type { TtsProviderDefinition, TtsSynthesizeOptions } from "./types.js";

const providers = new Map<string, TtsProviderDefinition>();

/** Register a TTS provider. Call this at module load in each provider file. */
export function registerTtsProvider(provider: TtsProviderDefinition): void {
	providers.set(provider.id, provider);
}

/** Get a registered TTS provider by id. */
export function getTtsProvider(id: string): TtsProviderDefinition | undefined {
	return providers.get(id);
}

/** List all registered TTS providers (sorted by name). */
export function listTtsProviders(): TtsProviderDefinition[] {
	return Array.from(providers.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

/**
 * Synthesize speech using a registered provider.
 * Falls back to "edge" if the requested provider is not found or fails auth checks.
 */
export async function synthesize(
	providerId: string,
	options: TtsSynthesizeOptions,
): Promise<string | null> {
	const provider = providers.get(providerId);

	// Fallback to edge with voice cleared (other provider voices don't work with Edge)
	const fallbackToEdge = () => {
		const edge = providers.get("edge");
		if (!edge) return null;
		return edge.synthesize({ ...options, voice: undefined });
	};

	if (!provider) {
		return fallbackToEdge();
	}

	if (provider.requiresApiKey && !options.apiKey) {
		return fallbackToEdge();
	}

	if (provider.requiresNaiaKey && !options.naiaKey) {
		return fallbackToEdge();
	}

	return provider.synthesize(options);
}

// Built-in providers are loaded via tts/index.ts barrel imports.
// Import tts/index.ts to ensure all providers are registered.
