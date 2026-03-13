/**
 * Provider registry — auto-register pattern.
 *
 * Providers self-register by calling defineProvider() at module load time.
 * The registry uses composite keys (type:id) to avoid collisions between
 * LLM, TTS, and STT providers that share the same brand id (e.g. "nextain").
 */

import type { ProviderDefinition, ProviderType } from "./types";

const registry = new Map<string, ProviderDefinition>();

function compositeKey(type: ProviderType, id: string): string {
	return `${type}:${id}`;
}

/**
 * Register a provider definition. Call this at the bottom of each provider file.
 * Returns the definition for convenience (export const myProvider = defineProvider({...})).
 */
export function defineProvider<T extends ProviderDefinition>(definition: T): T {
	registry.set(compositeKey(definition.type, definition.id), definition);
	return definition;
}

/** Get all registered providers, optionally filtered by type. Sorted by order then name. */
export function listProviders(type?: ProviderType): ProviderDefinition[] {
	const all = Array.from(registry.values());
	const filtered = type ? all.filter((p) => p.type === type) : all;
	return filtered.sort((a, b) => {
		const orderA = a.order ?? 99;
		const orderB = b.order ?? 99;
		if (orderA !== orderB) return orderA - orderB;
		return a.name.localeCompare(b.name);
	});
}

/** Get a provider by ID. Optionally specify type to disambiguate (e.g. "nextain" exists as both LLM and TTS). */
export function getProvider(id: string, type?: ProviderType): ProviderDefinition | undefined {
	if (type) {
		return registry.get(compositeKey(type, id));
	}
	// Without type: return first match (insertion order)
	for (const entry of registry.values()) {
		if (entry.id === id) return entry;
	}
	return undefined;
}

/** Check if a provider ID is registered. Optionally specify type. */
export function hasProvider(id: string, type?: ProviderType): boolean {
	if (type) {
		return registry.has(compositeKey(type, id));
	}
	for (const entry of registry.values()) {
		if (entry.id === id) return true;
	}
	return false;
}

/** Get all provider IDs of a given type. */
export function getProviderIds(type?: ProviderType): string[] {
	return listProviders(type).map((p) => p.id);
}

/** Clear the registry (for testing only). */
export function clearRegistry(): void {
	registry.clear();
}
