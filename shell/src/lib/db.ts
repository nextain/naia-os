import { invoke } from "@tauri-apps/api/core";

// === Facts (Shell-exclusive feature — Gateway has no structured facts) ===

export interface Fact {
	id: string;
	key: string;
	value: string;
	source_session: string | null;
	created_at: number;
	updated_at: number;
}

export async function getAllFacts(): Promise<Fact[]> {
	return invoke("memory_get_all_facts");
}

export async function upsertFact(fact: Fact): Promise<void> {
	return invoke("memory_upsert_fact", { fact });
}

export async function deleteFact(factId: string): Promise<void> {
	return invoke("memory_delete_fact", { factId });
}

// === Onboarding: API key validation ===

export async function validateApiKey(
	provider: string,
	apiKey: string,
): Promise<boolean> {
	return invoke("validate_api_key", { provider, apiKey });
}
