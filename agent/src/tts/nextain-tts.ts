import { GATEWAY_URL } from "../providers/lab-proxy.js";
import { registerTtsProvider } from "./registry.js";
import type { TtsSynthesizeResult } from "./types.js";

export async function synthesizeNextainSpeech(
	text: string,
	naiaKey: string,
	voice?: string,
): Promise<TtsSynthesizeResult | null> {
	if (!text.trim() || !naiaKey) return null;

	const selectedVoice = voice || "ko-KR-Chirp3-HD-Kore";

	try {
		const res = await fetch(`${GATEWAY_URL}/v1/audio/speech`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-AnyLLM-Key": `Bearer ${naiaKey}`,
			},
			body: JSON.stringify({
				input: text.slice(0, 5000),
				voice: selectedVoice,
				audio_encoding: "MP3",
			}),
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {
			audio_content?: string;
			cost_usd?: number;
		};
		if (!data.audio_content) return null;
		return {
			audio: data.audio_content,
			costUsd: data.cost_usd,
		};
	} catch {
		return null;
	}
}

registerTtsProvider({
	id: "nextain",
	name: "Naia Cloud TTS",
	requiresApiKey: false,
	requiresNaiaKey: true,
	synthesize: (opts) =>
		synthesizeNextainSpeech(opts.text, opts.naiaKey!, opts.voice),
});
