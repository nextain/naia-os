import type { Locale } from "./i18n";
import {
	SECRET_KEYS,
	deleteSecretKey,
	getSecretKey,
	saveSecretKey,
} from "./secure-store";
import { getProvider, listProviders } from "./providers/registry";
import type { ModelInfo } from "./providers/types";
import type { ProviderId } from "./types";
import type { LiveProviderId } from "./voice/types";

const STORAGE_KEY = "naia-config";
export const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

export type ThemeId =
	| "espresso"
	| "midnight"
	| "ocean"
	| "forest"
	| "rose"
	| "latte"
	| "sakura"
	| "cloud";

/** STT provider ID — plain string, validated by registry at runtime. */
export type SttProviderId = string;

/** Map app locale to Vosk STT language code. */
const LOCALE_TO_STT: Record<string, string> = {
	ko: "ko-KR",
	en: "en-US",
	ja: "ja-JP",
	zh: "zh-CN",
	fr: "fr-FR",
	de: "de-DE",
	ru: "ru-RU",
	es: "es-ES",
	pt: "pt-BR",
	hi: "hi-IN",
	ar: "ar-SA",
	vi: "vi-VN",
	id: "id-ID",
	bn: "bn-IN",
};

/** Convert app locale to STT language code. Falls back to en-US. */
export function localeToSttLanguage(locale: string): string {
	return LOCALE_TO_STT[locale] ?? LOCALE_TO_STT[locale.slice(0, 2)] ?? "en-US";
}

/** TTS provider ID — plain string, validated by registry at runtime. */
export type TtsProviderId = string;

export type PanelPosition = "left" | "right" | "bottom";

export interface AppConfig {
	provider: ProviderId;
	model: string;
	apiKey: string;
	locale?: Locale;
	theme?: ThemeId;
	backgroundImage?: string;
	vrmModel?: string;
	customVrms?: string[];
	customBgs?: string[];
	ttsEnabled?: boolean;
	ttsVoice?: string;
	googleApiKey?: string;
	ttsProvider?: TtsProviderId;
	ttsEngine?: "auto" | "openclaw" | "google";
	persona?: string;
	enableTools?: boolean;
	gatewayUrl?: string;
	gatewayToken?: string;
	chatRouting?: "gateway" | "direct" | "auto";
	discordDefaultUserId?: string;
	discordDefaultTarget?: string;
	discordDmChannelId?: string;
	allowedTools?: string[];
	userName?: string;
	agentName?: string;
	honorific?: string;
	speechStyle?: string;
	onboardingComplete?: boolean;
	naiaKey?: string;
	naiaUserId?: string;
	disabledSkills?: string[];
	slackWebhookUrl?: string;
	discordWebhookUrl?: string;
	googleChatWebhookUrl?: string;
	openaiTtsApiKey?: string;
	elevenlabsApiKey?: string;
	gatewayTtsAuto?: string;
	gatewayTtsMode?: string;
	panelPosition?: PanelPosition;
	panelVisible?: boolean;
	panelSize?: number;
	discordSessionMigrated?: boolean;
	ollamaHost?: string;
	voiceConversation?: boolean;
	liveProvider?: LiveProviderId;
	liveVoice?: string;
	liveModel?: string;
	openaiRealtimeApiKey?: string;
	openaiRealtimeVoice?: string;
}

/**
 * Get the model options for a provider from the registry.
 * Returns ModelInfo[] (compatible with the old ModelOption type).
 */
export function getModelOptions(provider: ProviderId): ModelInfo[] {
	return getProvider(provider, "llm")?.listModels?.() ?? [];
}

/**
 * Build the full model options map from the registry.
 * Call at runtime (providers must be registered first).
 */
export function buildModelOptionsMap(): Record<string, ModelInfo[]> {
	const result: Record<string, ModelInfo[]> = {};
	for (const p of listProviders("llm")) {
		result[p.id] = p.listModels?.() ?? [];
	}
	return result;
}

// ── Model type helpers ──

/** Model type: "llm" = text-only, "omni" = voice-integrated */
export type ModelType = "llm" | "omni";

/** Get the ModelInfo for a given provider + model ID */
export function getModelOption(provider: ProviderId, modelId: string): ModelInfo | undefined {
	return getModelOptions(provider).find((m) => m.id === modelId);
}

/** Get the model type for a given provider + model ID (defaults to "llm") */
export function getModelType(provider: ProviderId, modelId: string): ModelType {
	return getModelOption(provider, modelId)?.type ?? "llm";
}

/** Check if a model is an omni (voice-integrated) model */
export function isOmniModel(provider: ProviderId, modelId: string): boolean {
	return getModelType(provider, modelId) === "omni";
}


// ── Sync API (localStorage only, backwards compatible) ──

export function loadConfig(): AppConfig | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as AppConfig;
	} catch {
		return null;
	}
}

export function saveConfig(config: AppConfig): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function isApiKeyOptional(provider: ProviderId | undefined): boolean {
	if (!provider) return false;
	const def = getProvider(provider, "llm");
	return def ? !def.capabilities?.requiresApiKey : false;
}

export function hasApiKey(): boolean {
	const config = loadConfig();
	return !!config?.apiKey || !!config?.naiaKey;
}

export function isReadyToChat(): boolean {
	const config = loadConfig();
	if (!config) return false;
	return (
		isApiKeyOptional(config.provider) || !!config.apiKey || !!config.naiaKey
	);
}

export function hasNaiaKey(): boolean {
	const config = loadConfig();
	return !!config?.naiaKey;
}

export function getNaiaKey(): string | undefined {
	return loadConfig()?.naiaKey;
}

export function resolveGatewayUrl(
	config: AppConfig | null | undefined,
): string | undefined {
	if (!config?.enableTools) return undefined;
	const raw = config.gatewayUrl?.trim();
	return raw && raw.length > 0 ? raw : DEFAULT_GATEWAY_URL;
}

// ── Async API (secure store + localStorage fallback) ──

/**
 * Load full config: localStorage fields + secrets from secure store.
 */
export async function loadConfigWithSecrets(): Promise<AppConfig | null> {
	const config = loadConfig();
	if (!config) return null;

	for (const key of SECRET_KEYS) {
		const localVal = (config as any)[key];
		const secureVal = await getSecretKey(key);
		if (localVal) {
			// localStorage has a fresh value (e.g. just saved by login handler)
			// Sync to secure store if different
			if (localVal !== secureVal) {
				await saveSecretKey(key, localVal);
			}
		} else if (secureVal) {
			// Only use secure store when localStorage doesn't have the value
			(config as any)[key] = secureVal;
		}
	}
	return config;
}

/**
 * Save config: sensitive fields → secure store, rest → localStorage.
 */
export async function saveConfigSecure(config: AppConfig): Promise<void> {
	const publicConfig = { ...config };

	for (const key of SECRET_KEYS) {
		const val = (config as any)[key];
		if (typeof val === "string" && val.length > 0) {
			await saveSecretKey(key, val);
		}
		(publicConfig as any)[key] = undefined;
	}

	localStorage.setItem(STORAGE_KEY, JSON.stringify(publicConfig));
}

/**
 * Migrate secrets from localStorage to secure store.
 * Call once on app startup. Idempotent.
 */
export async function migrateSecretsToSecureStore(): Promise<void> {
	const config = loadConfig();
	if (!config) return;

	let migrated = false;
	for (const key of SECRET_KEYS) {
		const val = (config as any)[key];
		if (typeof val === "string" && val.length > 0) {
			const existing = await getSecretKey(key);
			if (!existing) {
				await saveSecretKey(key, val);
			}
			(config as any)[key] = undefined;
			migrated = true;
		}
	}

	if (migrated) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	}
}

/**
 * Async version: check secure store first, then localStorage.
 */
export async function hasApiKeySecure(): Promise<boolean> {
	const apiKey = await getSecretKey("apiKey");
	const naiaKey = await getSecretKey("naiaKey");
	if (apiKey || naiaKey) return true;
	return hasApiKey();
}

export async function getNaiaKeySecure(): Promise<string | undefined> {
	const secureVal = await getSecretKey("naiaKey");
	if (secureVal) return secureVal;
	return getNaiaKey();
}

export async function hasNaiaKeySecure(): Promise<boolean> {
	const key = await getNaiaKeySecure();
	return !!key;
}

/**
 * Migrate labKey/labUserId → naiaKey/naiaUserId.
 * Call once on app startup after migrateSecretsToSecureStore(). Idempotent.
 */
export async function migrateLabKeyToNaiaKey(): Promise<void> {
	// 1. Secure store: labKey → naiaKey (skip if Tauri not available)
	try {
		const oldKey = await getSecretKey("labKey" as any);
		if (oldKey) {
			await saveSecretKey("naiaKey", oldKey);
			await deleteSecretKey("labKey" as any);
		}
	} catch {
		// Tauri store not available (e.g. tests) — skip secure store migration
	}

	// 2. localStorage: labKey → naiaKey, labUserId → naiaUserId
	const config = loadConfig();
	if (!config) return;
	const raw = config as any;
	let changed = false;
	if (raw.labKey && !raw.naiaKey) {
		raw.naiaKey = raw.labKey;
		raw.labKey = undefined;
		changed = true;
	}
	if (raw.labUserId && !raw.naiaUserId) {
		raw.naiaUserId = raw.labUserId;
		raw.labUserId = undefined;
		changed = true;
	}
	if (changed) {
		localStorage.setItem("naia-config", JSON.stringify(raw));
	}
}

// ── Speech style migration ──

/** Normalize legacy Korean speech style values to locale-neutral keys */
export function normalizeSpeechStyle(val: string | undefined): string | undefined {
	if (!val) return val;
	if (val === "반말") return "casual";
	if (val === "존댓말") return "formal";
	return val;
}

/**
 * Migrate speechStyle from Korean values ("반말"/"존댓말") to locale-neutral ("casual"/"formal").
 * Call once on app startup. Idempotent.
 */
export function migrateSpeechStyleValues(): void {
	const config = loadConfig();
	if (!config?.speechStyle) return;
	const normalized = normalizeSpeechStyle(config.speechStyle);
	if (normalized !== config.speechStyle) {
		saveConfig({ ...config, speechStyle: normalized });
	}
}

// ── Utility functions (sync, unchanged) ──

export function getDefaultModel(provider: ProviderId): string {
	return getProvider(provider, "llm")?.defaultModel ?? "";
}

export function getDisabledSkills(): string[] {
	const config = loadConfig();
	return config?.disabledSkills ?? [];
}

export function isSkillDisabled(skillName: string): boolean {
	return getDisabledSkills().includes(skillName);
}

export function toggleSkill(skillName: string): void {
	const config = loadConfig();
	if (!config) return;
	const disabled = config.disabledSkills ?? [];
	const idx = disabled.indexOf(skillName);
	const next =
		idx >= 0
			? [...disabled.slice(0, idx), ...disabled.slice(idx + 1)]
			: [...disabled, skillName];
	saveConfig({ ...config, disabledSkills: next });
}

export function isToolAllowed(toolName: string): boolean {
	const config = loadConfig();
	return config?.allowedTools?.includes(toolName) ?? false;
}

export function addAllowedTool(toolName: string): void {
	const config = loadConfig();
	if (!config) return;
	const tools = config.allowedTools ?? [];
	if (!tools.includes(toolName)) {
		tools.push(toolName);
	}
	saveConfig({ ...config, allowedTools: tools });
}

export function clearAllowedTools(): void {
	const config = loadConfig();
	if (!config) return;
	saveConfig({ ...config, allowedTools: undefined });
}

export function isOnboardingComplete(): boolean {
	const config = loadConfig();
	return config?.onboardingComplete === true;
}

export function getUserName(): string | undefined {
	return loadConfig()?.userName;
}

/** any-llm Gateway URL (shared with agent/src/providers/lab-proxy.ts) */
export const LAB_GATEWAY_URL =
	"https://naia-gateway-181404717065.asia-northeast3.run.app";

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

export async function fetchOllamaModels(
	host?: string,
): Promise<{ models: ModelInfo[]; connected: boolean }> {
	const base = (host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, "");
	try {
		const res = await fetch(`${base}/api/tags`);
		if (!res.ok) return { models: [], connected: false };
		const data = await res.json();
		const models = (data.models ?? []).map((m: any) => {
			const sizeGB = m.size ? `${(m.size / 1e9).toFixed(1)}GB` : "";
			const quant = m.details?.quantization_level ?? "";
			const params = m.details?.parameter_size ?? "";
			const extra = [params, sizeGB, quant].filter(Boolean).join(", ");
			return {
				id: m.name,
				label: extra ? `${m.name} (${extra})` : m.name,
				type: "llm" as const,
			};
		});
		return { models, connected: true };
	} catch {
		return { models: [], connected: false };
	}
}
