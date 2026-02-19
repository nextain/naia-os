import type { GatewayClient } from "./client.js";

export type TtsProvider = "openai" | "elevenlabs" | "edge";
export type TtsMode = "final" | "all";
export type TtsAutoMode = "off" | "always" | "inbound" | "tagged";

/** Result from tts.status RPC */
export interface TtsStatusResult {
	enabled: boolean;
	provider: TtsProvider;
	auto: TtsAutoMode;
	mode: TtsMode;
}

/** Provider info from tts.providers RPC */
export interface TtsProviderInfo {
	id: string;
	label: string;
	configured: boolean;
	voices: string[];
}

/** Result from tts.convert RPC */
export interface TtsConvertResult {
	audio: string;
	format: string;
	durationMs?: number;
}

/** Get current TTS status and configuration */
export async function getTtsStatus(
	client: GatewayClient,
): Promise<TtsStatusResult> {
	const payload = await client.request("tts.status", {});
	return payload as TtsStatusResult;
}

/** List available TTS providers with configuration status */
export async function getTtsProviders(
	client: GatewayClient,
): Promise<TtsProviderInfo[]> {
	const payload = await client.request("tts.providers", {});
	return payload as TtsProviderInfo[];
}

/** Change the active TTS provider */
export async function setTtsProvider(
	client: GatewayClient,
	provider: TtsProvider,
): Promise<{ provider: string; applied: boolean }> {
	const payload = await client.request("tts.setProvider", { provider });
	return payload as { provider: string; applied: boolean };
}

/** Convert text to speech audio */
export async function convertTts(
	client: GatewayClient,
	text: string,
	options?: { voice?: string },
): Promise<TtsConvertResult> {
	const params: Record<string, unknown> = { text };
	if (options?.voice) {
		params.voice = options.voice;
	}
	const payload = await client.request("tts.convert", params);
	return payload as TtsConvertResult;
}

/** Enable TTS */
export async function enableTts(
	client: GatewayClient,
): Promise<{ enabled: boolean }> {
	const payload = await client.request("tts.enable", {});
	return payload as { enabled: boolean };
}

/** Disable TTS */
export async function disableTts(
	client: GatewayClient,
): Promise<{ enabled: boolean }> {
	const payload = await client.request("tts.disable", {});
	return payload as { enabled: boolean };
}
