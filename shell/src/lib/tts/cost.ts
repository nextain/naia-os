/**
 * TTS cost estimation per provider.
 * Returns estimated cost in USD for a given text length.
 */

const COST_PER_CHAR: Record<string, number> = {
	edge: 0,
	nextain: 0, // Naia credit, tracked separately
	google: 16 / 1_000_000, // $16/1M chars
	openai: 15 / 1_000_000, // $15/1M chars
	elevenlabs: 0.30 / 1_000, // $0.30/1K chars
};

/** Estimate TTS cost in USD. Returns 0 for free providers. */
export function estimateTtsCost(provider: string, textLength: number): number {
	const rate = COST_PER_CHAR[provider] ?? 0;
	return rate * textLength;
}
