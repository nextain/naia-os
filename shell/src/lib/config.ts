import type { Locale } from "./i18n";
import {
	SECRET_KEYS,
	deleteSecretKey,
	getSecretKey,
	saveSecretKey,
} from "./secure-store";
import type { ProviderId } from "./types";
// LiveProviderId kept for migration only — will be removed after migration period
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

export type TtsProviderId =
	| "google"
	| "edge"
	| "openai"
	| "elevenlabs"
	| "nextain";

export type PanelPosition = "left" | "right" | "bottom";

// ── Model Type (LLM vs Omni) ──

export type ModelType = "llm" | "omni";

export interface ModelOption {
	id: string;
	label: string;
	type: ModelType;
	/** Whether user can select a voice for this model */
	voiceSelectable?: boolean;
	/** Available voices (omni models only) */
	voices?: { id: string; label: string }[];
	/** Whether the model provides its own input transcript (omni models) */
	transcriptProvided?: boolean;
}

/** Gemini Live voice options */
export const GEMINI_LIVE_VOICES = [
	{ id: "Kore", label: "Kore (여성, 차분)" },
	{ id: "Puck", label: "Puck (남성, 활발)" },
	{ id: "Charon", label: "Charon (남성)" },
	{ id: "Aoede", label: "Aoede (여성)" },
	{ id: "Fenrir", label: "Fenrir (남성)" },
	{ id: "Leda", label: "Leda (여성)" },
	{ id: "Orus", label: "Orus (남성)" },
	{ id: "Zephyr", label: "Zephyr (중성)" },
] as const;

/** OpenAI Realtime voice options */
export const OPENAI_REALTIME_VOICES = [
	{ id: "alloy", label: "Alloy (중성)" },
	{ id: "ash", label: "Ash (남성)" },
	{ id: "ballad", label: "Ballad (남성)" },
	{ id: "coral", label: "Coral (여성)" },
	{ id: "echo", label: "Echo (남성)" },
	{ id: "sage", label: "Sage (여성)" },
	{ id: "shimmer", label: "Shimmer (여성)" },
	{ id: "verse", label: "Verse (남성)" },
	{ id: "marin", label: "Marin (추천)" },
	{ id: "cedar", label: "Cedar (추천)" },
] as const;

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
	minicpmOServerUrl?: string;
	/** Unified voice selection (replaces liveVoice/openaiRealtimeVoice after migration) */
	voice?: string;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
	nextain: "gemini-3-flash-preview",
	"claude-code-cli": "claude-sonnet-4-6",
	gemini: "gemini-3-flash-preview",
	openai: "gpt-4o",
	anthropic: "claude-sonnet-4-6",
	xai: "grok-3-mini",
	zai: "glm-4.7",
	ollama: "",
};

export const MODEL_OPTIONS: Record<ProviderId, ModelOption[]> = {
	nextain: [
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", type: "llm" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash", type: "llm" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", type: "llm" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", type: "llm" },
		{
			id: "gemini-2.5-flash-live",
			label: "Gemini 2.5 Flash Live 🔊",
			type: "omni",
			voiceSelectable: true,
			voices: [...GEMINI_LIVE_VOICES],
			transcriptProvided: true,
		},
	],
	"claude-code-cli": [
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6", type: "llm" },
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", type: "llm" },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", type: "llm" },
	],
	gemini: [
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro ($2.00 / $12.00)", type: "llm" },
		{ id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash ($0.50 / $3.00)", type: "llm" },
		{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro ($1.25 / $10.00)", type: "llm" },
		{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash ($0.30 / $2.50)", type: "llm" },
		{
			id: "gemini-2.5-flash-live",
			label: "Gemini 2.5 Flash Live 🔊 (~$0.03/min)",
			type: "omni",
			voiceSelectable: true,
			voices: [...GEMINI_LIVE_VOICES],
			transcriptProvided: true,
		},
	],
	openai: [
		{ id: "gpt-4o", label: "GPT-4o ($2.50 / $10.00)", type: "llm" },
		{
			id: "gpt-4o-realtime",
			label: "GPT-4o Realtime 🔊 (~$0.10/min)",
			type: "omni",
			voiceSelectable: true,
			voices: [...OPENAI_REALTIME_VOICES],
			transcriptProvided: true,
		},
	],
	anthropic: [
		{ id: "claude-opus-4-6", label: "Claude Opus 4.6 ($15.00 / $75.00)", type: "llm" },
		{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 ($3.00 / $15.00)", type: "llm" },
		{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 ($0.80 / $4.00)", type: "llm" },
	],
	xai: [{ id: "grok-3-mini", label: "Grok 3 Mini ($0.30 / $0.50)", type: "llm" }],
	zai: [{ id: "glm-4.7", label: "GLM 4.7 ($0.60 / $2.20)", type: "llm" }],
	ollama: [],
};

// ── Model type helpers ──

/** Get the ModelOption for a given provider + model ID */
export function getModelOption(provider: ProviderId, modelId: string): ModelOption | undefined {
	return MODEL_OPTIONS[provider]?.find((m) => m.id === modelId);
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
	return provider === "claude-code-cli" || provider === "ollama";
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

// ── Live provider → unified model migration ──

/**
 * Migrate legacy liveProvider settings to unified model selection.
 * Call once on app startup after other migrations. Idempotent.
 *
 * liveProvider: "naia" → provider: "nextain", model: "gemini-2.5-flash-live"
 * liveProvider: "gemini-live" → provider: "gemini", model: "gemini-2.5-flash-live"
 * liveProvider: "openai-realtime" → provider: "openai", model: "gpt-4o-realtime"
 * liveProvider: "edge-tts" → ttsProvider: "edge" (pipeline TTS)
 * liveProvider: "minicpm-o" → preserved in config (backlog #33), UI hidden
 */
export function migrateLiveProviderToUnifiedModel(): void {
	const config = loadConfig();
	if (!config) return;
	const raw = config as any;

	// Skip if already migrated (no liveProvider field)
	if (!raw.liveProvider) return;

	let changed = false;

	switch (raw.liveProvider) {
		case "naia":
			raw.voice = raw.liveVoice;
			raw.provider = "nextain";
			raw.model = "gemini-2.5-flash-live";
			changed = true;
			break;
		case "gemini-live":
			raw.voice = raw.liveVoice;
			raw.provider = "gemini";
			raw.model = "gemini-2.5-flash-live";
			changed = true;
			break;
		case "openai-realtime":
			raw.voice = raw.openaiRealtimeVoice;
			raw.provider = "openai";
			raw.model = "gpt-4o-realtime";
			changed = true;
			break;
		case "edge-tts":
			// Edge TTS moves to pipeline TTS provider
			if (!raw.ttsProvider) raw.ttsProvider = "edge";
			changed = true;
			break;
		case "minicpm-o":
			// Keep minicpmOServerUrl, just clear liveProvider
			changed = true;
			break;
	}

	if (changed) {
		delete raw.liveProvider;
		delete raw.liveVoice;
		delete raw.liveModel;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
	}
}

// ── Utility functions (sync, unchanged) ──

export function getDefaultModel(provider: ProviderId): string {
	return DEFAULT_MODELS[provider];
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
): Promise<{ models: ModelOption[]; connected: boolean }> {
	const base = (host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, "");
	try {
		const res = await fetch(`${base}/api/tags`);
		if (!res.ok) return { models: [], connected: false };
		const data = await res.json();
		const models: ModelOption[] = (data.models ?? []).map((m: any) => {
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
