import type { GatewayAdapter } from "./types.js";

/** Result from voicewake.get/set RPC */
export interface VoiceWakeResult {
	triggers: string[];
}

/** Get current voice wake triggers */
export async function getVoiceWakeTriggers(
	client: GatewayAdapter,
): Promise<VoiceWakeResult> {
	const payload = await client.request("voicewake.get", {});
	return payload as VoiceWakeResult;
}

/** Set voice wake triggers */
export async function setVoiceWakeTriggers(
	client: GatewayAdapter,
	triggers: string[],
): Promise<VoiceWakeResult> {
	const payload = await client.request("voicewake.set", { triggers });
	return payload as VoiceWakeResult;
}
