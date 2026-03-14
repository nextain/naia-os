/**
 * TTS/STT cost estimation per provider.
 * Returns estimated cost in USD.
 */

const TTS_COST_PER_CHAR: Record<string, number> = {
	edge: 0,
	nextain: 4 / 1_000_000, // $4/1M chars (standard tier via gateway)
	google: 16 / 1_000_000, // $16/1M chars (Neural2)
	openai: 15 / 1_000_000, // $15/1M chars
	elevenlabs: 0.30 / 1_000, // $0.30/1K chars
};

/** Estimate TTS cost in USD. */
export function estimateTtsCost(provider: string, textLength: number): number {
	const rate = TTS_COST_PER_CHAR[provider] ?? 0;
	return rate * textLength;
}

/** Estimate STT cost in USD. $0.006 per 15-second increment. */
export function estimateSttCost(provider: string, durationSeconds: number): number {
	if (provider === "vosk" || provider === "whisper") return 0; // offline, free
	if (provider === "edge") return 0;
	// Google / Naia Cloud / ElevenLabs — billed per 15s increment
	const increments = Math.max(1, Math.ceil(durationSeconds / 15));
	return increments * 0.006;
}
