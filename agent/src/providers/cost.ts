/** Per-million-token pricing for supported models */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Gemini
	"gemini-2.5-flash": { input: 0.15, output: 0.6 },
	"gemini-2.5-pro": { input: 1.25, output: 10.0 },
	"gemini-2.0-flash": { input: 0.1, output: 0.4 },
	"gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
	// xAI
	"grok-3": { input: 3.0, output: 15.0 },
	"grok-3-fast": { input: 5.0, output: 25.0 },
	"grok-3-mini": { input: 0.3, output: 0.5 },
	"grok-3-mini-fast": { input: 0.6, output: 4.0 },
	"grok-2": { input: 2.0, output: 10.0 },
	// Anthropic
	"claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
	"claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
	"claude-opus-4-6": { input: 15.0, output: 75.0 },
};

export function calculateCost(
	model: string,
	inputTokens: number,
	outputTokens: number,
): number {
	const pricing = MODEL_PRICING[model];
	if (!pricing) return 0;
	return (
		(pricing.input / 1_000_000) * inputTokens +
		(pricing.output / 1_000_000) * outputTokens
	);
}
