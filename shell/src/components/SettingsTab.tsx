import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLongPress } from "../hooks/useLongPress";
import { directToolCall } from "../lib/chat-service";
import {
	DEFAULT_GATEWAY_URL,
	DEFAULT_OLLAMA_HOST,
	LAB_GATEWAY_URL,
	type PanelPosition,
	type ThemeId,
	type SttProviderId,
	type TtsProviderId,
	clearAllowedTools,
	loadConfig,
	resolveGatewayUrl,
	saveConfig,
	getNaiaKeySecure,
} from "../lib/config";
import {
	listLlmProviders,
	getLlmProvider,
	isOmniModel,
	getDefaultLlmModel,
	isApiKeyOptional,
	getStaticModelsRecord,
	fetchOllamaModels,
	formatModelLabel,
	type LlmModelMeta,
} from "../lib/llm";
import { saveSecretKey, deleteSecretKey } from "../lib/secure-store";
import {
	type Fact,
	deleteFact,
	getAllFacts,
} from "../lib/db";
import { type Locale, getLocale, setLocale, t } from "../lib/i18n";
import { parseLabCredits } from "../lib/lab-balance";
import { Logger } from "../lib/logger";
import { syncToOpenClaw, restartGateway } from "../lib/openclaw-sync";
import { syncLinkedChannels } from "../lib/channel-sync";
import { fetchLabConfig, pushConfigToLab, clearLabConfig, diffConfigs } from "../lib/lab-sync";
import { DEFAULT_PERSONA, FORMALITY_LOCALES, buildSystemPrompt } from "../lib/persona";
import { resetGatewaySession } from "../lib/gateway-sessions";
import type { ProviderId } from "../lib/types";
import { type UpdateInfo, checkForUpdate } from "../lib/updater";
import { AVATAR_PRESETS, DEFAULT_AVATAR_MODEL, getDefaultVoiceForAvatar, getDefaultTtsVoiceForAvatar } from "../lib/avatar-presets";
import { listSttProviders } from "../lib/stt/registry";
import { listTtsProviderMetas } from "../lib/tts/registry";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";

const LLM_PROVIDERS = listLlmProviders();

// Fallback voice lists for Edge TTS
const ALL_EDGE_VOICES: string[] = [
	// 한국어
	"ko-KR-SunHiNeural",
	"ko-KR-InJoonNeural",
	"ko-KR-HyunsuMultilingualNeural",
	// English
	"en-US-AvaNeural",
	"en-US-AndrewNeural",
	"en-US-EmmaNeural",
	"en-US-BrianNeural",
	"en-US-AriaNeural",
	"en-US-AnaNeural",
	"en-US-ChristopherNeural",
	"en-US-EricNeural",
	"en-US-GuyNeural",
	"en-US-JennyNeural",
	"en-US-MichelleNeural",
	"en-US-RogerNeural",
	"en-US-SteffanNeural",
	"en-US-AndrewMultilingualNeural",
	"en-US-AvaMultilingualNeural",
	"en-US-BrianMultilingualNeural",
	"en-US-EmmaMultilingualNeural",
	"en-GB-LibbyNeural",
	"en-GB-SoniaNeural",
	"en-GB-RyanNeural",
	"en-GB-ThomasNeural",
	"en-GB-MaisieNeural",
	"en-AU-NatashaNeural",
	"en-AU-WilliamMultilingualNeural",
	// 日本語
	"ja-JP-NanamiNeural",
	"ja-JP-KeitaNeural",
	// 中文
	"zh-CN-XiaoxiaoNeural",
	"zh-CN-XiaoyiNeural",
	"zh-CN-YunjianNeural",
	"zh-CN-YunxiNeural",
	"zh-CN-YunxiaNeural",
	"zh-CN-YunyangNeural",
	"zh-TW-HsiaoChenNeural",
	"zh-TW-HsiaoYuNeural",
	"zh-TW-YunJheNeural",
	// Français
	"fr-FR-DeniseNeural",
	"fr-FR-HenriNeural",
	"fr-FR-EloiseNeural",
	"fr-FR-VivienneMultilingualNeural",
	"fr-FR-RemyMultilingualNeural",
	// Deutsch
	"de-DE-KatjaNeural",
	"de-DE-ConradNeural",
	"de-DE-AmalaNeural",
	"de-DE-KillianNeural",
	"de-DE-SeraphinaMultilingualNeural",
	"de-DE-FlorianMultilingualNeural",
	// Русский
	"ru-RU-SvetlanaNeural",
	"ru-RU-DmitryNeural",
	// Español
	"es-ES-ElviraNeural",
	"es-ES-AlvaroNeural",
	"es-ES-XimenaNeural",
	"es-MX-DaliaNeural",
	"es-MX-JorgeNeural",
	// العربية
	"ar-SA-ZariyahNeural",
	"ar-SA-HamedNeural",
	"ar-EG-SalmaNeural",
	"ar-EG-ShakirNeural",
	// हिन्दी
	"hi-IN-SwaraNeural",
	"hi-IN-MadhurNeural",
	// বাংলা
	"bn-BD-NabanitaNeural",
	"bn-BD-PradeepNeural",
	"bn-IN-TanishaaNeural",
	"bn-IN-BashkarNeural",
	// Português
	"pt-BR-FranciscaNeural",
	"pt-BR-AntonioNeural",
	"pt-BR-ThalitaMultilingualNeural",
	"pt-PT-RaquelNeural",
	"pt-PT-DuarteNeural",
	// Bahasa Indonesia
	"id-ID-GadisNeural",
	"id-ID-ArdiNeural",
	// Tiếng Việt
	"vi-VN-HoaiMyNeural",
	"vi-VN-NamMinhNeural",
];

/** Filter Edge voices by locale; multilingual voices always included */
function getEdgeVoicesForLocale(loc: string): string[] {
	const langPrefix = loc.slice(0, 2).toLowerCase() + "-";
	return ALL_EDGE_VOICES.filter(
		(v) => v.toLowerCase().startsWith(langPrefix) || v.includes("Multilingual"),
	);
}


const LOCALES: { id: Locale; label: string }[] = [
	{ id: "ko", label: "한국어" },
	{ id: "en", label: "English" },
	{ id: "ja", label: "日本語" },
	{ id: "zh", label: "中文" },
	{ id: "fr", label: "Français" },
	{ id: "de", label: "Deutsch" },
	{ id: "ru", label: "Русский" },
	{ id: "es", label: "Español" },
	{ id: "ar", label: "العربية" },
	{ id: "hi", label: "हिन्दी" },
	{ id: "bn", label: "বাংলা" },
	{ id: "pt", label: "Português" },
	{ id: "id", label: "Bahasa Indonesia" },
	{ id: "vi", label: "Tiếng Việt" },
];

function getNaiaWebBaseUrl() {
	return (
		import.meta.env.VITE_NAIA_WEB_BASE_URL?.trim() ||
		"https://naia.nextain.io"
	);
}

interface DeviceNode {
	nodeId: string;
	displayName?: string;
	platform?: string;
}

interface PairReq {
	requestId: string;
	nodeId: string;
	status: string;
}

function normalizeLocalPath(path: string): string {
	if (!path.startsWith("file://")) return path;
	try {
		return decodeURIComponent(new URL(path).pathname);
	} catch {
		return path.replace(/^file:\/\//, "");
	}
}

function toAssetUrl(path: string): string {
	const normalized = normalizeLocalPath(path);
	if (normalized.startsWith("http://localhost")) {
		return normalized.replace(
			/^http:\/\/localhost\/?/,
			"http://asset.localhost/",
		);
	}
	if (
		normalized.startsWith("/assets/") ||
		normalized.startsWith("/avatars/") ||
		normalized.startsWith("asset:") ||
		normalized.startsWith("http://asset.localhost") ||
		normalized.startsWith("tauri://") ||
		normalized.startsWith("blob:") ||
		normalized.startsWith("data:")
	) {
		return normalized;
	}
	const assetUrl = convertFileSrc(normalized);
	return assetUrl
		.replace(/^asset:\/\/localhost\/?/, "http://asset.localhost/")
		.replace(/^http:\/\/localhost\/?/, "http://asset.localhost/");
}

function buildVrmPreviewCandidates(path: string): string[] {
	const rootPath = normalizeLocalPath(path).replace(/\.vrm$/i, "");
	const candidates = [".webp", ".png", ".jpg", ".jpeg"];
	return candidates.map((ext) => toAssetUrl(`${rootPath}${ext}`));
}

function buildLocalVrmPreviewCandidates(path: string): string[] {
	const rootPath = normalizeLocalPath(path).replace(/\.vrm$/i, "");
	return [".webp", ".png", ".jpg", ".jpeg"].map((ext) => `${rootPath}${ext}`);
}

function isAbsoluteLocalFilePath(path: string): boolean {
	return path.startsWith("/");
}

function guessMimeType(path: string): string {
	const ext = path.toLowerCase().split(".").pop() ?? "";
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		case "bmp":
			return "image/bmp";
		default:
			return "application/octet-stream";
	}
}

function CustomAssetCard({
	path,
	isSelected,
	onSelect,
	onDelete,
	type,
}: {
	path: string;
	isSelected: boolean;
	onSelect: () => void;
	onDelete: () => void;
	type: "vrm" | "bg";
}) {
	const [deleteMode, setDeleteMode] = useState(false);
	const previewCandidates = useMemo(
		() => (type === "vrm" ? buildVrmPreviewCandidates(path) : []),
		[path, type],
	);
	const [previewIndex, setPreviewIndex] = useState(0);
	const [localPreviewSrc, setLocalPreviewSrc] = useState<string | null>(null);
	useEffect(() => {
		setPreviewIndex(0);
	}, [path, type]);
	useEffect(() => {
		let revokedUrl = "";
		let cancelled = false;
		setLocalPreviewSrc(null);

		const normalized = normalizeLocalPath(path);
		const isLocal =
			isAbsoluteLocalFilePath(normalized) &&
			!normalized.startsWith("/assets/") &&
			!normalized.startsWith("/avatars/");
		if (!isLocal) return;

		const loadLocalPreview = async () => {
			try {
				const targetPaths =
					type === "bg" ? [normalized] : buildLocalVrmPreviewCandidates(normalized);
				for (const targetPath of targetPaths) {
					try {
						const bytes = await invoke<number[]>("read_local_binary", {
							path: targetPath,
						});
						if (cancelled) return;
						const blob = new Blob([new Uint8Array(bytes)], {
							type: guessMimeType(targetPath),
						});
						revokedUrl = URL.createObjectURL(blob);
						setLocalPreviewSrc(revokedUrl);
						return;
					} catch {
						// try next candidate
					}
				}
			} catch {
				// keep default preview fallback
			}
		};

		void loadLocalPreview();
		return () => {
			cancelled = true;
			if (revokedUrl) URL.revokeObjectURL(revokedUrl);
		};
	}, [path, type]);
	const lp = useLongPress(
		() => setDeleteMode(true),
		() => {
			if (deleteMode) onDelete();
			else onSelect();
		},
	);

	if (type === "vrm") {
		const previewSrc = localPreviewSrc ?? previewCandidates[previewIndex];
		return (
			<button
				type="button"
				className={`vrm-card ${isSelected ? "active" : ""} ${deleteMode ? "shake" : ""}`}
				title={path}
				{...lp}
				onClick={(e) => {
					e.preventDefault();
					if (!deleteMode) onSelect();
				}}
				style={{ position: "relative" }}
				onMouseLeave={() => {
					lp.onMouseLeave();
					setDeleteMode(false);
				}}
			>
				{previewSrc ? (
					<img
						src={previewSrc}
						alt={path.split("/").pop()?.replace(".vrm", "") ?? "VRM"}
						style={{ width: "100%", height: "100%", objectFit: "cover" }}
						onError={() => {
							if (previewIndex < previewCandidates.length - 1) {
								setPreviewIndex((prev) => prev + 1);
							} else {
								setPreviewIndex(-1);
							}
						}}
					/>
				) : (
					<>
						<span className="vrm-card-icon">&#x1F464;</span>
						<span className="vrm-card-label">
							{path.split("/").pop()?.replace(".vrm", "")}
						</span>
					</>
				)}
				{deleteMode && <div className="delete-overlay">🗑️</div>}
			</button>
		);
	}

	return (
		<button
			type="button"
			className={`bg-card ${isSelected ? "active" : ""} ${deleteMode ? "shake" : ""}`}
			title={path}
			{...lp}
			onClick={(e) => {
				e.preventDefault();
				if (!deleteMode) onSelect();
			}}
			style={{ position: "relative" }}
			onMouseLeave={() => {
				lp.onMouseLeave();
				setDeleteMode(false);
			}}
		>
			<span
				className="bg-card-preview"
				style={{
					backgroundImage: `url(${localPreviewSrc ?? toAssetUrl(path)})`,
				}}
			/>
			<span className="bg-card-label">{path.split("/").pop()}</span>
			{deleteMode && <div className="delete-overlay">🗑️</div>}
		</button>
	);
}

function DevicePairingSection() {
	const [nodes, setNodes] = useState<DeviceNode[]>([]);
	const [pairRequests, setPairRequests] = useState<PairReq[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchDevices = useCallback(async () => {
		const config = loadConfig();
		const gatewayUrl = resolveGatewayUrl(config);
		if (!gatewayUrl) return;
		setLoading(true);
		try {
			const [nodesRes, pairRes] = await Promise.all([
				directToolCall({
					toolName: "skill_device",
					args: { action: "node_list" },
					requestId: `dev-nodes-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				}),
				directToolCall({
					toolName: "skill_device",
					args: { action: "pair_list" },
					requestId: `dev-pairs-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				}),
			]);

			if (nodesRes.success && nodesRes.output) {
				const parsed = JSON.parse(nodesRes.output);
				setNodes(parsed.nodes || []);
			}
			if (pairRes.success && pairRes.output) {
				const parsed = JSON.parse(pairRes.output);
				setPairRequests(parsed.requests || []);
			}
		} catch (err) {
			Logger.warn("DevicePairing", "Failed to fetch devices", {
				error: String(err),
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchDevices();
	}, [fetchDevices]);

	const handlePairAction = useCallback(
		async (requestId: string, action: "approve" | "reject") => {
			const config = loadConfig();
			const gatewayUrl = resolveGatewayUrl(config);
			try {
				await directToolCall({
					toolName: "skill_device",
					args: { action: `pair_${action}`, requestId },
					requestId: `dev-${action}-${Date.now()}`,
					gatewayUrl,
					gatewayToken: config?.gatewayToken,
				});
				fetchDevices();
			} catch (err) {
				Logger.warn("DevicePairing", `Failed to ${action}`, {
					error: String(err),
				});
			}
		},
		[fetchDevices],
	);

	return (
		<>
			<div className="settings-section-divider">
				<span>{t("settings.deviceSection")}</span>
			</div>
			<div className="settings-field">
				<span className="settings-hint">{t("settings.deviceHint")}</span>
			</div>

			{loading ? (
				<div className="settings-field">
					<span className="settings-hint">{t("settings.deviceLoading")}</span>
				</div>
			) : (
				<>
					{/* Paired nodes */}
					{nodes.length === 0 ? (
						<div className="settings-field">
							<span className="settings-hint">{t("settings.deviceEmpty")}</span>
						</div>
					) : (
						<div className="device-nodes-list">
							{nodes.map((node) => (
								<div key={node.nodeId} className="device-node-card">
									<span className="device-node-name">
										{node.displayName || node.nodeId}
									</span>
									{node.platform && (
										<span className="device-node-platform">
											{node.platform}
										</span>
									)}
								</div>
							))}
						</div>
					)}

					{/* Pair requests */}
					{pairRequests.length > 0 && (
						<>
							<div className="settings-field">
								<label>{t("settings.devicePairRequests")}</label>
							</div>
							<div className="device-pair-requests">
								{pairRequests.map((req) => (
									<div key={req.requestId} className="device-pair-card">
										<span className="device-pair-node">{req.nodeId}</span>
										<span className="device-pair-status">
											{req.status === "pending"
												? t("settings.devicePending")
												: req.status}
										</span>
										{req.status === "pending" && (
											<div className="device-pair-actions">
												<button
													type="button"
													className="device-pair-approve"
													onClick={() =>
														handlePairAction(req.requestId, "approve")
													}
												>
													{t("settings.deviceApprove")}
												</button>
												<button
													type="button"
													className="device-pair-reject"
													onClick={() =>
														handlePairAction(req.requestId, "reject")
													}
												>
													{t("settings.deviceReject")}
												</button>
											</div>
										)}
									</div>
								))}
							</div>
						</>
					)}

					{pairRequests.length === 0 && nodes.length > 0 && (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.deviceNoPairRequests")}
							</span>
						</div>
					)}
				</>
			)}
		</>
	);
}

const BG_SAMPLES: { path: string; label: string }[] = [
	{ path: "/assets/background-space.webp", label: "Space" },
];

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
	{ id: "espresso", label: "Light", preview: "#ffffff" },
	{ id: "midnight", label: "Dark", preview: "#1a1a2e" },
	{ id: "ocean", label: "Ocean", preview: "#1b2838" },
	{ id: "forest", label: "Forest", preview: "#1a2e1a" },
	{ id: "rose", label: "Rose", preview: "#2e1a2a" },
	{ id: "latte", label: "Latte", preview: "#fffcf5" },
	{ id: "sakura", label: "Sakura", preview: "#fdf2f8" },
	{ id: "cloud", label: "Cloud", preview: "#f1f5f9" },
];

interface SttModelInfo {
	engine: string;
	modelId: string;
	modelName: string;
	language: string;
	sizeMb: number;
	wer: string;
	downloadUrl: string;
	description: string;
	downloaded: boolean;
	ready: boolean;
}

export function SettingsTab() {
	const existing = loadConfig();
	const setAvatarModelPath = useAvatarStore((s) => s.setModelPath);
	const setAvatarBackgroundImage = useAvatarStore((s) => s.setBackgroundImage);
	const [savedVrmModel, setSavedVrmModel] = useState(
		normalizeLocalPath(existing?.vrmModel ?? DEFAULT_AVATAR_MODEL)
	);
	const [savedBgImage, setSavedBgImage] = useState(
		normalizeLocalPath(existing?.backgroundImage ?? "")
	);
	const [provider, setProvider] = useState<ProviderId>(
		existing?.provider ?? "gemini",
	);
	const initProvider = existing?.provider ?? "gemini";
	const savedModel = existing?.model;
	const modelValid =
		savedModel && (getLlmProvider(initProvider)?.models.some((m) => m.id === savedModel) ?? false);
	const [model, setModel] = useState(
		modelValid ? savedModel : getDefaultLlmModel(initProvider),
	);
	const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
	const [locale, setLocaleState] = useState<Locale>(
		existing?.locale ?? getLocale(),
	);
	const [theme, setTheme] = useState<ThemeId>(existing?.theme ?? "espresso");
	const [panelPos, setPanelPos] = useState<PanelPosition>(existing?.panelPosition ?? "bottom");
	const [vrmModel, setVrmModel] = useState(savedVrmModel);
	const [customVrms, setCustomVrms] = useState<string[]>(
		(existing?.customVrms ?? []).map(normalizeLocalPath),
	);
	const [customBgs, setCustomBgs] = useState<string[]>(
		(existing?.customBgs ?? []).map(normalizeLocalPath),
	);
	const [backgroundImage, setBackgroundImage] = useState(
		normalizeLocalPath(existing?.backgroundImage ?? ""),
	);
	const defaultVoiceForProvider = getDefaultTtsVoiceForAvatar(
		existing?.ttsProvider ?? "edge", existing?.vrmModel,
	);
	const [ttsVoice, setTtsVoice] = useState(
		existing?.ttsVoice ?? defaultVoiceForProvider,
	);
	const [googleApiKey, setGoogleApiKey] = useState(
		existing?.googleApiKey ?? "",
	);
	const [ttsProvider, setTtsProvider] = useState<TtsProviderId>(
		existing?.ttsProvider ??
			(existing?.ttsEngine === "openclaw" ? "edge" :
			 existing?.ttsEngine === "google" ? "google" : "edge"),
	);
	const [sttProvider, setSttProvider] = useState<SttProviderId>(existing?.sttProvider ?? "");
	const [sttModel, setSttModel] = useState(existing?.sttModel ?? "");
	const [sttModels, setSttModels] = useState<SttModelInfo[]>([]);
	const [sttDownloading, setSttDownloading] = useState<string | null>(null);
	const [sttDownloadProgress, setSttDownloadProgress] = useState(0);

	const [ttsEnabled, setTtsEnabled] = useState(existing?.ttsEnabled ?? false);
	const [persona, setPersona] = useState(existing?.persona ?? DEFAULT_PERSONA);
	const [userName, setUserName] = useState(existing?.userName ?? "");
	const [agentName, setAgentName] = useState(existing?.agentName ?? "");
	const [honorific, setHonorific] = useState(existing?.honorific ?? "");
	const [speechStyle, setSpeechStyle] = useState(existing?.speechStyle ?? "casual");
	const [enableTools, setEnableTools] = useState(
		existing?.enableTools ?? true,
	);
	const [voice, setVoice] = useState(
		existing?.voice ?? getDefaultVoiceForAvatar(existing?.vrmModel),
	);
	const [openaiRealtimeApiKey, setOpenaiRealtimeApiKey] = useState(
		existing?.openaiRealtimeApiKey ?? "",
	);
	const [dynamicModels, setDynamicModels] = useState<Record<string, LlmModelMeta[]>>(getStaticModelsRecord);
	const [ollamaHost, setOllamaHost] = useState(existing?.ollamaHost ?? DEFAULT_OLLAMA_HOST);
	const [ollamaConnected, setOllamaConnected] = useState(false);
	const [gatewayUrl, setGatewayUrl] = useState(
		existing?.gatewayUrl ?? "ws://localhost:18789",
	);
	const [gatewayToken, setGatewayToken] = useState(
		existing?.gatewayToken ?? "",
	);
	const [discordDefaultUserId, setDiscordDefaultUserId] = useState(
		existing?.discordDefaultUserId ?? "",
	);
	const [discordDefaultTarget, setDiscordDefaultTarget] = useState(
		existing?.discordDefaultTarget ?? "",
	);
	const [discordDmChannelId, setDiscordDmChannelId] = useState(
		existing?.discordDmChannelId ?? "",
	);
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [dynamicTtsVoices, setDynamicTtsVoices] = useState<{ id: string; label: string; gender?: string }[]>([]);
	const [facts, setFacts] = useState<Fact[]>([]);
	const [allowedToolsCount, setAllowedToolsCount] = useState(existing?.allowedTools?.length ?? 0);
	const [naiaKey, setNaiaKeyState] = useState(existing?.naiaKey ?? "");
	const [naiaUserId, setNaiaUserIdState] = useState(existing?.naiaUserId ?? "");
	const [sttModelModalOpen, setSttModelModalOpen] = useState(false);
	const [syncDialogOpen, setSyncDialogOpen] = useState(false);
	const [syncDialogOnlineConfig, setSyncDialogOnlineConfig] = useState<Record<string, unknown> | null>(null);
	const labSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Load STT model catalog on mount
	useEffect(() => {
		invoke<SttModelInfo[]>("list_stt_models")
			.then(setSttModels)
			.catch((e) => Logger.warn("Settings", "Failed to load STT models", { error: String(e) }));
	}, []);

	// Listen for download progress events
	useEffect(() => {
		let unlisten: (() => void) | null = null;
		listen<{ status: string; model: string; progress: number }>(
			"stt://download-progress",
			(event) => {
				const { status, progress } = event.payload;
				setSttDownloadProgress(Math.min(progress, 100));
				if (status === "complete") {
					setSttDownloading(null);
					setSttDownloadProgress(0);
					// Refresh catalog
					invoke<SttModelInfo[]>("list_stt_models")
						.then(setSttModels)
						.catch(() => {});
				}
			},
		).then((fn) => { unlisten = fn; });
		return () => { unlisten?.(); };
	}, []);

	useEffect(() => {
		const modelPrefixPattern =
			/^(nextain|claude-code-cli|claude-code|gemini|google|openai|anthropic|claude|xai|grok|zai|glm|ollama)[:/](.+)$/i;
		const providerAlias: Record<string, ProviderId> = {
			nextain: "nextain",
			"claude-code-cli": "claude-code-cli",
			"claude-code": "claude-code-cli",
			gemini: "gemini",
			google: "gemini",
			openai: "openai",
			anthropic: "anthropic",
			claude: "anthropic",
			xai: "xai",
			grok: "xai",
			zai: "zai",
			glm: "zai",
			ollama: "ollama",
		};

		const normalizeModelId = (raw: string): string => {
			const matched = modelPrefixPattern.exec(raw);
			if (matched?.[2]) return matched[2];
			return raw;
		};

		const resolveProvider = (raw: unknown): ProviderId | null => {
			if (typeof raw !== "string") return null;
			return providerAlias[raw.toLowerCase()] ?? null;
		};

		const resolveProviderFromId = (id: string): ProviderId | null => {
			const matched = modelPrefixPattern.exec(id);
			if (!matched?.[1]) return null;
			return resolveProvider(matched[1]);
		};

		const extractModels = (
			parsed: unknown,
		): Array<{
			id: string;
			name?: string;
			provider?: string;
			price?: { input?: number; output?: number };
		}> => {
			if (Array.isArray(parsed)) return parsed as any[];

			if (parsed && typeof parsed === "object") {
				const root = parsed as Record<string, unknown>;

				if (Array.isArray(root.models)) {
					return root.models as any[];
				}

				if (root.data && typeof root.data === "object") {
					const data = root.data as Record<string, unknown>;
					if (Array.isArray(data.models)) {
						return data.models as any[];
					}
				}

				if (root.providers && typeof root.providers === "object") {
					const providers = root.providers as Record<string, unknown>;
					const out: any[] = [];
					for (const [providerName, value] of Object.entries(providers)) {
						if (!Array.isArray(value)) continue;
						for (const item of value) {
							if (typeof item === "string") {
								out.push({ id: item, provider: providerName, name: item });
							} else if (item && typeof item === "object") {
								out.push({ provider: providerName, ...(item as object) });
							}
						}
					}
					return out;
				}
			}

			return [];
		};

		async function fetchModels() {
			try {
				const res = await directToolCall({
					toolName: "skill_config",
					args: { action: "models" },
					requestId: `fetch-models-${Date.now()}`,
					gatewayUrl: gatewayUrl.trim() || DEFAULT_GATEWAY_URL,
					gatewayToken,
				});

				if (res.success && res.output) {
					const parsed = JSON.parse(res.output);
					const models = extractModels(parsed);
					if (models.length === 0) return;

					const grouped = Object.fromEntries(
						Object.entries(getStaticModelsRecord()).map(([k, v]) => [k, [...v]]),
					) as Record<string, LlmModelMeta[]>;

					for (const m of models) {
						if (!m || typeof m.id !== "string") continue;
						const modelId = normalizeModelId(m.id);
						const priceStr = m.price
							? ` ($${m.price.input ?? "?"} / $${m.price.output ?? "?"})`
							: "";
						const label = `${m.name || modelId}${priceStr}`;

						const pushModel = (key: string) => {
							if (!grouped[key]?.some((x) => x.id === modelId)) {
								grouped[key].push({ id: modelId, label, type: "llm" as const });
							}
						};

			const mappedProvider =
				resolveProvider(m.provider) || resolveProviderFromId(m.id);
			if (mappedProvider) pushModel(mappedProvider);
			// Claude Code CLI uses subscription — add models without pricing
			if (mappedProvider === "anthropic") {
				const nameOnly = m.name || modelId;
				if (!grouped["claude-code-cli"]?.some((x) => x.id === modelId)) {
					grouped["claude-code-cli"].push({ id: modelId, label: nameOnly, type: "llm" as const });
				}
			}
			// Naia only supports curated Gemini models (from registry)
			if (mappedProvider === "gemini") {
				const nextainModelIds = getLlmProvider("nextain")?.models
					.filter((nm) => nm.type === "llm")
					.map((nm) => nm.id) ?? [];
				if (nextainModelIds.includes(modelId)) {
					pushModel("nextain");
				}
			}
		}

					setDynamicModels(grouped);
				}
			} catch {
				// Fallback to static registry models
			}
		}
		fetchModels();
	}, [gatewayUrl, gatewayToken]);

	useEffect(() => {
		if (provider !== "ollama") return;
		fetchOllamaModels(ollamaHost).then(({ models, connected }) => {
			setOllamaConnected(connected);
			if (models.length > 0) {
				setDynamicModels((prev) => ({ ...prev, ollama: models }));
				if (!model || !models.some((m) => m.id === model)) {
					setModel(models[0].id);
				}
			}
		});
	}, [provider, ollamaHost]);

	useEffect(() => {
		getNaiaKeySecure().then((key) => {
			if (key && key !== naiaKey) {
				setNaiaKeyState(key);
			}
		});
	}, [naiaKey]);
	const [labWaiting, setLabWaiting] = useState(false);
	const [labBalance, setLabBalance] = useState<number | null>(null);
	const [labBalanceLoading, setLabBalanceLoading] = useState(false);
	const [labBalanceError, setLabBalanceError] = useState(false);

	const startLabLogin = () => {
		setLabWaiting(true);
		openUrl(`https://naia.nextain.io/${locale}/login?redirect=desktop`).catch(() =>
			setLabWaiting(false),
		);
		setTimeout(() => setLabWaiting(false), 60_000);
	};

	// Gateway TTS state
	// gatewayTtsApiKey: shared state for TTS API key input (used by multiple providers)
	const [gatewayTtsApiKey, setGatewayTtsApiKey] = useState(() => {
		const p = existing?.ttsProvider ?? "edge";
		if (p === "openai") return existing?.openaiTtsApiKey ?? "";
		if (p === "elevenlabs") return existing?.elevenlabsApiKey ?? "";
		if (p === "google") return existing?.googleApiKey ?? "";
		return "";
	});

	// Voice wake state
	const [voiceWakeTriggers, setVoiceWakeTriggers] = useState<string[]>([]);
	const [voiceWakeInput, setVoiceWakeInput] = useState("");
	const [voiceWakeLoading, setVoiceWakeLoading] = useState(false);
	const [voiceWakeSaved, setVoiceWakeSaved] = useState(false);
	const [discordBotConnected, setDiscordBotConnected] = useState(false);
	const [discordBotLoading, setDiscordBotLoading] = useState(false);

	// In-app confirmation state (replaces window.confirm to avoid WebKitGTK double-dialog)
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const [resetClearHistory, setResetClearHistory] = useState(false);
	const [showLabDisconnect, setShowLabDisconnect] = useState(false);
	const [showReOnboarding, setShowReOnboarding] = useState(false);

	const fetchVoiceWake = useCallback(async () => {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		setVoiceWakeLoading(true);
		try {
			const result = await directToolCall({
				toolName: "skill_voicewake",
				args: { action: "get" },
				requestId: `vw-get-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
			if (result.success && result.output) {
				const data = JSON.parse(result.output);
				setVoiceWakeTriggers(data.triggers || []);
			}
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to load voice wake triggers", {
				error: String(err),
			});
		} finally {
			setVoiceWakeLoading(false);
		}
	}, [gatewayUrl, gatewayToken]);

	const fetchDiscordBotStatus = useCallback(async () => {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		setDiscordBotLoading(true);
		try {
			const result = await directToolCall({
				toolName: "skill_channels",
				args: { action: "status" },
				requestId: `discord-status-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
			if (result.success && result.output) {
				const channels = JSON.parse(result.output) as Array<{
					id?: string;
					accounts?: Array<{ connected?: boolean }>;
				}>;
				const discord = channels.find((ch) => ch.id === "discord");
				const connected =
					discord?.accounts?.some((acc) => acc.connected === true) ?? false;
				setDiscordBotConnected(connected);
			} else {
				setDiscordBotConnected(false);
			}
		} catch {
			setDiscordBotConnected(false);
		} finally {
			setDiscordBotLoading(false);
		}
	}, [gatewayUrl, gatewayToken]);

	useEffect(() => {
		fetchVoiceWake();
		fetchDiscordBotStatus();
	}, [fetchVoiceWake, fetchDiscordBotStatus]);

	useEffect(() => {
		getAllFacts()
			.then((result) => setFacts(result ?? []))
			.catch((err) => {
				Logger.warn("SettingsTab", "Failed to load facts", {
					error: String(err),
				});
			});
	}, []);

	// Fetch Lab balance for a given key
	function fetchLabBalance(key: string) {
		Logger.debug("SettingsTab", "fetchLabBalance called", {
			keyPrefix: key.slice(0, 8),
			keyLength: key.length,
		});
		setLabBalanceLoading(true);
		setLabBalanceError(false);
		fetch(`${LAB_GATEWAY_URL}/v1/profile/balance`, {
			headers: { "X-AnyLLM-Key": `Bearer ${key}` },
		})
			.then((res) => {
				if (res.status === 401) {
					// Key is invalid/expired — clear it so login screen shows
					Logger.warn("SettingsTab", "Naia key invalid (401), clearing stored key");
					setNaiaKeyState("");
					deleteSecretKey("naiaKey").catch(() => {});
					const cfg = loadConfig();
					if (cfg) {
						const { naiaKey: _removed, ...rest } = cfg;
						saveConfig(rest as typeof cfg);
					}
					throw new Error("KEY_EXPIRED");
				}
				if (!res.ok) {
					return res.text().then((text) => {
						throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
					});
				}
				return res.json();
			})
			.then((data: unknown) => {
				const credits = parseLabCredits(data);
				setLabBalance(credits ?? 0);
				setLabBalanceError(false);
			})
			.catch((err) => {
				if (String(err).includes("KEY_EXPIRED")) return;
				Logger.warn("SettingsTab", "Lab balance fetch failed", {
					error: String(err),
				});
				setLabBalanceError(true);
			})
			.finally(() => setLabBalanceLoading(false));
	}

	// Fetch Lab balance when naiaKey is available
	useEffect(() => {
		if (!naiaKey) return;
		fetchLabBalance(naiaKey);
	}, [naiaKey]);

	// Listen for Lab auth deep-link callback
	useEffect(() => {
		const unlisten = listen<{ naiaKey: string; naiaUserId?: string }>(
			"naia_auth_complete",
			async (event) => {
				const nextNaiaKey = event.payload.naiaKey;
				const nextNaiaUserId = event.payload.naiaUserId ?? "";
				setNaiaKeyState(nextNaiaKey);
				setNaiaUserIdState(nextNaiaUserId);
				setProvider("nextain");
				setModel((prev) => prev || getDefaultLlmModel("nextain"));
				setError("");
				// In Lab mode, clear direct API key input to avoid confusion.
				setApiKey("");
				setLabWaiting(false);

				// Fetch balance immediately with the new key
				fetchLabBalance(nextNaiaKey);

				// Persist to both secure store and localStorage
				await saveSecretKey("naiaKey", nextNaiaKey);
				const current = loadConfig();
				const nextModel = current?.model || getDefaultLlmModel("nextain");
				if (current) {
					// Auto-set default voice based on VRM avatar gender if not previously configured
					const defaultVoice = current.voice ?? getDefaultVoiceForAvatar(current.vrmModel);
					saveConfig({
						...current,
						provider: "nextain",
						model: nextModel,
						naiaKey: nextNaiaKey,
						naiaUserId: nextNaiaUserId || undefined,
						voice: defaultVoice,
					});
				}

				// Sync to OpenClaw (no API key for Lab proxy)
				const naiaFullPrompt = buildSystemPrompt(current?.persona, {
					agentName: current?.agentName,
					userName: current?.userName,
					honorific: current?.honorific,
					speechStyle: current?.speechStyle,
					locale: current?.locale || getLocale(),
					discordDefaultUserId: current?.discordDefaultUserId,
					discordDmChannelId: current?.discordDmChannelId,
				});
				await syncToOpenClaw("nextain", nextModel, undefined, current?.persona, current?.agentName, current?.userName, naiaFullPrompt, current?.locale || getLocale(), current?.discordDmChannelId, current?.discordDefaultUserId, undefined, undefined, undefined, undefined, nextNaiaKey);
				await restartGateway();

				// Sync linked channels (e.g. Discord) after login
				// Re-check Discord bot status after sync + gateway restart
				syncLinkedChannels().then(() => {
					setTimeout(() => fetchDiscordBotStatus(), 3000);
				});

				// Try Lab pull — show diff dialog if settings differ
				if (nextNaiaUserId) {
					const onlineConfig = await fetchLabConfig(nextNaiaKey, nextNaiaUserId);
					if (onlineConfig && current) {
						const diffs = diffConfigs(current, onlineConfig);
						if (diffs.length > 0) {
							setSyncDialogOnlineConfig(onlineConfig as Record<string, unknown>);
							setSyncDialogOpen(true);
						}
					}
				}
			},
		);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Listen for Discord auth deep-link callback — UI state only (App.tsx handles persist)
	useEffect(() => {
		const unlisten = listen<{
			discordUserId?: string | null;
			discordChannelId?: string | null;
			discordTarget?: string | null;
		}>("discord_auth_complete", (event) => {
			const { discordUserId, discordChannelId, discordTarget } = event.payload;
			if (discordUserId) setDiscordDefaultUserId(discordUserId);
			if (discordTarget) setDiscordDefaultTarget(discordTarget);
			else if (discordUserId) setDiscordDefaultTarget(`user:${discordUserId}`);
			if (discordChannelId) setDiscordDmChannelId(discordChannelId);
			setDiscordBotConnected(true);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Live-preview: apply VRM instantly on selection
	function handleVrmSelect(path: string) {
		const normalized = normalizeLocalPath(path);
		setVrmModel(normalized);
		setAvatarModelPath(normalized);
	}

	function handleBgSelect(path: string) {
		const normalized = normalizeLocalPath(path);
		setBackgroundImage(normalized);
		setAvatarBackgroundImage(normalized);
	}

	// Revert on unmount if not saved
	useEffect(() => {
		return () => {
			// Restore saved VRM when leaving settings without saving
			const currentVrm = useAvatarStore.getState().modelPath;
			if (currentVrm !== savedVrmModel) {
				setAvatarModelPath(savedVrmModel);
			}
			const currentBg = useAvatarStore.getState().backgroundImage;
			if (currentBg !== savedBgImage) {
				setAvatarBackgroundImage(savedBgImage);
			}
		};
	}, [savedVrmModel, savedBgImage, setAvatarModelPath, setAvatarBackgroundImage]);

	function handleProviderChange(id: ProviderId) {
		setProvider(id);
		if (id !== "ollama") {
			setModel(getDefaultLlmModel(id));
		}
		setError("");
		if (id === "nextain" && !naiaKey) {
			setError("Naia 계정 로그인이 필요합니다. 먼저 Naia에 로그인하세요.");
			startLabLogin();
		}
	}

	function handleLocaleChange(id: Locale) {
		setLocaleState(id);
		setLocale(id);
	}

	function handleThemeChange(id: ThemeId) {
		setTheme(id);
		document.documentElement.setAttribute("data-theme", id);
	}

	function handlePanelPositionChange(pos: PanelPosition) {
		setPanelPos(pos);
		const config = loadConfig();
		if (config) saveConfig({ ...config, panelPosition: pos });
		// Dispatch custom event so App.tsx can react
		window.dispatchEvent(
			new CustomEvent("naia:panel-position", { detail: pos }),
		);
	}

	async function handlePickVrmFile() {
		const selected = await open({
			title: "VRM 파일 선택",
			filters: [{ name: "VRM", extensions: ["vrm"] }],
			multiple: false,
		});
		if (selected) {
			const normalized = normalizeLocalPath(selected as string);
			setCustomVrms((prev) => {
				if (prev.includes(normalized)) return prev;
				return [...prev, normalized];
			});
			handleVrmSelect(normalized);
		}
	}

	async function handlePickBgFile() {
		const selected = await open({
			title: t("settings.bgPickerTitle"),
			filters: [
				{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
			],
			multiple: false,
		});
		if (selected) {
			const normalized = normalizeLocalPath(selected as string);
			setCustomBgs((prev) => {
				if (prev.includes(normalized)) return prev;
				return [...prev, normalized];
			});
			handleBgSelect(normalized);
		}
	}



	function debouncedLabSync() {
		if (labSyncTimerRef.current) clearTimeout(labSyncTimerRef.current);
		labSyncTimerRef.current = setTimeout(() => {
			const cfg = loadConfig();
			if (!cfg) return;
			if (naiaKey && naiaUserId) pushConfigToLab(naiaKey, naiaUserId, cfg);
			// Also sync TTS settings to OpenClaw gateway config
			syncToOpenClaw(
				cfg.provider, cfg.model,
				undefined, undefined, undefined, undefined, undefined, undefined,
				undefined, undefined,
				undefined, undefined, undefined, undefined,
				naiaKey || undefined,
			);
		}, 2000);
	}

	// Persist TTS voice/provider changes immediately (without full handleSave)
	function persistTtsVoice(voice: string) {
		setTtsVoice(voice);
		if (existing) {
			saveConfig({ ...existing, ttsVoice: voice });
		}
		debouncedLabSync();
	}
	function getPreviewText(_voice?: string): string {
		const lang = locale.slice(0, 2).toLowerCase();
		switch (lang) {
			case "ko": return "안녕하세요, 반갑습니다. 오늘도 좋은 하루 되세요.";
			case "en": return "Hello, nice to meet you. Have a great day!";
			case "ja": return "こんにちは、はじめまして。良い一日をお過ごしください。";
			case "zh": return "你好，很高兴认识你。祝你有美好的一天！";
			case "fr": return "Bonjour, enchanté. Passez une bonne journée !";
			case "de": return "Hallo, freut mich. Einen schönen Tag noch!";
			case "es": return "Hola, mucho gusto. ¡Que tengas un buen día!";
			case "ru": return "Здравствуйте, приятно познакомиться. Хорошего дня!";
			case "ar": return "مرحباً، سعيد بلقائك. أتمنى لك يوماً سعيداً!";
			case "hi": return "नमस्ते, आपसे मिलकर खुशी हुई। आपका दिन शुभ हो!";
			case "bn": return "নমস্কার, আপনার সাথে দেখা হয়ে ভালো লাগলো। শুভ দিন!";
			case "pt": return "Olá, prazer em conhecê-lo. Tenha um ótimo dia!";
			case "id": return "Halo, senang bertemu Anda. Semoga hari Anda menyenangkan!";
			case "vi": return "Xin chào, rất vui được gặp bạn. Chúc bạn một ngày tốt lành!";
			default: return "Hello, nice to meet you. Have a great day!";
		}
	}

	async function handleVoicePreview() {
		if (isPreviewing) return;
		setError("");
		setIsPreviewing(true);
		try {
			let base64 = "";
			const modelMeta = (dynamicModels[provider] ?? []).find((m) => m.id === model);
			const isOmni = modelMeta?.type === "omni";

			if (isOmni && (provider === "nextain" || provider === "gemini")) {
				// Gemini voice preview via Chirp 3 HD
				const voiceName = voice || getDefaultVoiceForAvatar(existing?.vrmModel);
				const fullVoice = `ko-KR-Chirp3-HD-${voiceName}`;
				const previewText = getPreviewText();

				if (naiaKey) {
					const resp = await fetch(`${LAB_GATEWAY_URL}/v1/audio/speech`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-AnyLLM-Key": `Bearer ${naiaKey}`,
						},
						body: JSON.stringify({
							input: previewText,
							voice: fullVoice,
							audio_encoding: "MP3",
						}),
					});
					if (!resp.ok) {
						const body = await resp.text().catch(() => "");
						throw new Error(`미리듣기 실패 (${resp.status}): ${body.slice(0, 200)}`);
					}
					const data = await resp.json() as { audio_content?: string };
					base64 = data.audio_content ?? "";
				} else {
					setError("미리듣기를 사용하려면 Naia 로그인이 필요합니다.");
					return;
				}
			} else if (isOmni && provider === "openai") {
				// OpenAI TTS preview via agent skill_tts
				const previewVoice = voice || "alloy";
				const previewText = getPreviewText(previewVoice);
				const previewArgs: Record<string, unknown> = {
					action: "preview",
					provider: "openai",
					text: previewText,
					voice: previewVoice,
					apiKey: openaiRealtimeApiKey.trim() || existing?.openaiTtsApiKey || undefined,
				};
				const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
				const result = await directToolCall({
					toolName: "skill_tts",
					args: previewArgs,
					requestId: `tts-preview-${Date.now()}`,
					gatewayUrl: effectiveGatewayUrl,
					gatewayToken,
				});
				if (!result.success || !result.output) {
					throw new Error("OpenAI 미리듣기에 실패했습니다. API Key를 확인하세요.");
				}
				const parsedOai = JSON.parse(result.output) as { audio?: string };
				if (!parsedOai.audio) {
					throw new Error("TTS 오디오 데이터를 수신하지 못했습니다.");
				}
				base64 = parsedOai.audio;
			} else {
				// TTS preview via agent skill_tts — use selected ttsProvider
				const previewText = getPreviewText(ttsVoice);
				const selectedProvider = ttsProvider || "edge";
				const previewArgs: Record<string, unknown> = {
					action: "preview",
					provider: selectedProvider,
					text: previewText,
					voice: ttsVoice,
				};
				// Pass API key for providers that need it
				if (selectedProvider === "openai" && gatewayTtsApiKey) {
					previewArgs.apiKey = gatewayTtsApiKey;
				} else if (selectedProvider === "elevenlabs" && gatewayTtsApiKey) {
					previewArgs.apiKey = gatewayTtsApiKey;
				} else if (selectedProvider === "google" && gatewayTtsApiKey) {
					previewArgs.apiKey = gatewayTtsApiKey;
				}
				if (selectedProvider === "nextain" && naiaKey) {
					previewArgs.naiaKey = naiaKey;
				}
				const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
				const result = await directToolCall({
					toolName: "skill_tts",
					args: previewArgs,
					requestId: `tts-preview-${Date.now()}`,
					gatewayUrl: effectiveGatewayUrl,
					gatewayToken,
				});
				if (!result.success || !result.output) {
					const providerName = listTtsProviderMetas().find((p) => p.id === selectedProvider)?.name ?? selectedProvider;
					throw new Error(`${providerName} 미리듣기에 실패했습니다.${selectedProvider !== "edge" ? " API Key를 확인하세요." : ""}`);
				}
				const parsed = JSON.parse(result.output) as { audio?: string };
				if (!parsed.audio) {
					throw new Error("TTS 오디오 데이터를 수신하지 못했습니다.");
				}
				base64 = parsed.audio;
			}
			const audio = new Audio(`data:audio/mp3;base64,${base64}`);
			await audio.play();
		} catch (err) {
			setError(
				`TTS 미리듣기 실패: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsPreviewing(false);
		}
	}


	function handleVoiceWakeAdd() {
		const trimmed = voiceWakeInput.trim();
		if (trimmed && !voiceWakeTriggers.includes(trimmed)) {
			setVoiceWakeTriggers((prev) => [...prev, trimmed]);
			setVoiceWakeInput("");
		}
	}

	function handleVoiceWakeRemove(trigger: string) {
		setVoiceWakeTriggers((prev) => prev.filter((item) => item !== trigger));
	}

	async function handleVoiceWakeSave() {
		const effectiveGatewayUrl = gatewayUrl.trim() || DEFAULT_GATEWAY_URL;
		try {
			await directToolCall({
				toolName: "skill_voicewake",
				args: { action: "set", triggers: voiceWakeTriggers },
				requestId: `vw-set-${Date.now()}`,
				gatewayUrl: effectiveGatewayUrl,
				gatewayToken,
			});
			setVoiceWakeSaved(true);
			setTimeout(() => setVoiceWakeSaved(false), 2000);
		} catch (err) {
			Logger.warn("SettingsTab", "Failed to save voice wake triggers", {
				error: String(err),
			});
		}
	}

	function handleReset() {
		setShowResetConfirm(true);
	}

	async function executeReset() {
		localStorage.removeItem("naia-config");
		localStorage.removeItem("naia-camera");
		invoke("reset_window_state").catch(() => {});
		if (resetClearHistory) {
			useChatStore.getState().newConversation();
			resetGatewaySession().catch(() => {});
			invoke("reset_openclaw_data").catch(() => {});
		}
		setLocale("ko");
		document.documentElement.setAttribute("data-theme", "espresso");
		window.location.reload();
	}

	async function handleSttModelDownload(modelId: string) {
		setSttDownloading(modelId);
		setSttDownloadProgress(0);
		try {
			await invoke("download_stt_model", { modelId });
		} catch (e) {
			Logger.warn("Settings", "STT model download failed", { error: String(e) });
			setSttDownloading(null);
			setSttDownloadProgress(0);
		}
	}

	async function handleSttModelDelete(modelId: string) {
		try {
			await invoke("delete_stt_model", { modelId });
			// Refresh catalog
			const models = await invoke<SttModelInfo[]>("list_stt_models");
			setSttModels(models);
			// Clear selection if deleted model was selected
			if (sttModel === modelId) {
				setSttModel("");
			}
		} catch (e) {
			Logger.warn("Settings", "STT model delete failed", { error: String(e) });
		}
	}

	function handleSyncDialogApply() {
		if (!syncDialogOnlineConfig) return;
		const current = loadConfig();
		if (!current) return;
		const merged = { ...current, ...syncDialogOnlineConfig };
		saveConfig(merged);
		// Update local state from merged config
		if (merged.userName) setUserName(merged.userName);
		if (merged.agentName) setAgentName(merged.agentName);
		if (merged.honorific !== undefined) setHonorific(merged.honorific ?? "");
		if (merged.speechStyle) setSpeechStyle(merged.speechStyle);
		if (merged.persona) setPersona(merged.persona ?? DEFAULT_PERSONA);
		if (merged.locale) setLocaleState(merged.locale);
		if (merged.theme) setTheme(merged.theme);
		if (merged.sttProvider) setSttProvider(merged.sttProvider);
		if (merged.sttModel) setSttModel(merged.sttModel);
		if (merged.ttsEnabled !== undefined) setTtsEnabled(merged.ttsEnabled);
		if (merged.ttsVoice) setTtsVoice(merged.ttsVoice);
		if (merged.ttsProvider) setTtsProvider(merged.ttsProvider);
		setSyncDialogOpen(false);
		setSyncDialogOnlineConfig(null);
	}

	function handleSave() {
		// Keep previous key when input is empty (password field UX).
		const resolvedApiKey = apiKey.trim() || existing?.apiKey || "";
		const isNextainProvider = provider === "nextain";
		if (isNextainProvider && !naiaKey) {
			setError("Naia 계정 로그인이 필요합니다. Naia 계정 연결 후 저장하세요.");
			return;
		}
		if (
			!isNextainProvider &&
			!isApiKeyOptional(provider) &&
			!resolvedApiKey &&
			!naiaKey
		) {
			setError(t("settings.apiKeyRequired"));
			return;
		}
		const defaultVrm = DEFAULT_AVATAR_MODEL;
		// Derive ttsEngine from ttsProvider for agent compatibility
		// Only "google" uses direct Google TTS; all others (including nextain) use Gateway
		const derivedTtsEngine = ttsProvider === "google" ? "google" : "openclaw";
		const newConfig = {
			...existing,
			provider,
			model,
			apiKey: isNextainProvider || isApiKeyOptional(provider) ? "" : resolvedApiKey,
			naiaKey: naiaKey || undefined,
			naiaUserId: naiaUserId || undefined,
			locale,
			theme,
			vrmModel: vrmModel !== defaultVrm ? vrmModel : undefined,
			customVrms: customVrms.length > 0 ? customVrms : undefined,
			customBgs: customBgs.length > 0 ? customBgs : undefined,
			backgroundImage: backgroundImage || undefined,
			sttProvider: sttProvider || undefined,
			sttModel: sttModel || undefined,
			ttsEnabled,
			ttsVoice,
			ttsProvider,
			ttsEngine: derivedTtsEngine as "google" | "openclaw",
			googleApiKey: (ttsProvider === "google" && gatewayTtsApiKey.trim())
				? gatewayTtsApiKey.trim()
				: (googleApiKey.trim() || existing?.googleApiKey || undefined),
			openaiTtsApiKey: (ttsProvider === "openai" && gatewayTtsApiKey.trim())
				? gatewayTtsApiKey.trim()
				: (existing?.openaiTtsApiKey || undefined),
			elevenlabsApiKey: (ttsProvider === "elevenlabs" && gatewayTtsApiKey.trim())
				? gatewayTtsApiKey.trim()
				: (existing?.elevenlabsApiKey || undefined),
			persona:
				persona.trim() !== DEFAULT_PERSONA.trim() ? persona.trim() : undefined,
			userName: userName.trim() || undefined,
			agentName: agentName.trim() || undefined,
			honorific: honorific.trim() || undefined,
			speechStyle,
			enableTools,
			gatewayUrl: enableTools
				? gatewayUrl.trim() || DEFAULT_GATEWAY_URL
				: undefined,
			gatewayToken: gatewayToken.trim() || undefined,
			discordDefaultUserId: discordDefaultUserId.trim() || undefined,
			discordDefaultTarget: discordDefaultTarget.trim() || undefined,
			discordDmChannelId: discordDmChannelId.trim() || undefined,
				ollamaHost: provider === "ollama" ? ollamaHost.trim() || undefined : existing?.ollamaHost,
			voice: isOmniModel(provider, model) ? voice : existing?.voice,
			openaiRealtimeApiKey: openaiRealtimeApiKey.trim() || undefined,
		};
		saveConfig(newConfig);
		if (naiaKey) void saveSecretKey("naiaKey", naiaKey);
		setLocale(locale);
		setAvatarModelPath(vrmModel);
		setAvatarBackgroundImage(backgroundImage);
		setSavedVrmModel(vrmModel);
		setSavedBgImage(backgroundImage);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);

		// Sync provider/model + full system prompt to OpenClaw gateway config
		const fullPrompt = buildSystemPrompt(newConfig.persona, {
			agentName: newConfig.agentName,
			userName: newConfig.userName,
			honorific: newConfig.honorific,
			speechStyle: newConfig.speechStyle,
			locale: newConfig.locale || getLocale(),
			discordDefaultUserId: newConfig.discordDefaultUserId,
			discordDmChannelId: newConfig.discordDmChannelId,
		});
		syncToOpenClaw(newConfig.provider, newConfig.model, resolvedApiKey, newConfig.persona, newConfig.agentName, newConfig.userName, fullPrompt, newConfig.locale || getLocale(), newConfig.discordDmChannelId, newConfig.discordDefaultUserId, undefined, undefined, undefined, undefined, naiaKey || undefined, newConfig.ollamaHost || undefined)
			.then(() => restartGateway());

		// Auto-sync to Lab if connected
		if (naiaKey && naiaUserId) {
			pushConfigToLab(naiaKey, naiaUserId, newConfig);
		}
	}

	const providerModels = dynamicModels[provider] ?? [];
	const selectedModelMeta = providerModels.find((m) => m.id === model);
	const hasSelectedModel = Boolean(selectedModelMeta);
	const isSelectedOmni = selectedModelMeta?.type === "omni";
	const omniVoices = selectedModelMeta?.voices;
	const manualUrl = `https://naia.nextain.io/${locale}/manual`;

	async function handleDiscordBotConnect() {
		if (!enableTools) {
			setError(t("settings.enableToolsFirst"));
			return;
		}
		setError("");
		setDiscordBotLoading(true);
		try {
			const connectUrl = `${getNaiaWebBaseUrl()}/${locale}/settings/integrations?channel=discord&source=naia-shell`;
			await openUrl(connectUrl);
			await fetchDiscordBotStatus();
		} catch (err) {
			setError(
				`${t("settings.discordConnectError")}: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setDiscordBotLoading(false);
		}
	}

	return (
		<div className="settings-tab">
			<div className="settings-field">
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<label htmlFor="locale-select" style={{ margin: 0 }}>
						{t("settings.language")}
					</label>
					<select
						id="locale-select"
						value={locale}
						onChange={(e) => handleLocaleChange(e.target.value as Locale)}
						style={{ width: "auto", minWidth: 120 }}
					>
						{LOCALES.map((l) => (
							<option key={l.id} value={l.id}>
								{l.label}
							</option>
						))}
					</select>
					<button
						type="button"
						className="voice-preview-btn"
						onClick={() => openUrl(manualUrl).catch(() => {})}
					>
						{t("settings.manual")}
					</button>
				</div>
			</div>

			<div className="settings-field">
				<label>{t("settings.theme")}</label>
				<div className="theme-picker">
					{THEMES.map((th) => (
						<button
							key={th.id}
							type="button"
							className={`theme-swatch ${theme === th.id ? "active" : ""}`}
							style={{ background: th.preview }}
							onClick={() => handleThemeChange(th.id)}
							title={th.label}
						/>
					))}
				</div>
			</div>

			<div className="settings-field">
				<label>{t("settings.panelPosition")}</label>
				<div className="panel-position-picker">
					{(
						[
							{ id: "left", label: t("settings.panelLeft") },
							{ id: "right", label: t("settings.panelRight") },
							{ id: "bottom", label: t("settings.panelBottom") },
						] as const
					).map((opt) => (
						<button
							key={opt.id}
							type="button"
							className={`panel-position-btn ${panelPos === opt.id ? "active" : ""}`}
							onClick={() => handlePanelPositionChange(opt.id)}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			<div className="settings-section-divider">
				<span>{t("settings.avatarSection")}</span>
			</div>

			<div className="settings-field">
				<label>{t("settings.vrmModel")}</label>
				<div className="vrm-picker">
					{AVATAR_PRESETS.map((v) => (
						<button
							key={v.path}
							type="button"
							className={`vrm-card ${vrmModel === v.path ? "active" : ""}`}
							onClick={() => handleVrmSelect(v.path)}
							title={v.label}
							style={v.previewImage ? { padding: 0, overflow: "hidden" } : {}}
						>
							{v.previewImage ? (
								<img
									src={v.previewImage}
									alt={v.label}
									style={{ width: "100%", height: "100%", objectFit: "cover" }}
								/>
							) : (
								<>
									<span className="vrm-card-icon">&#x1F464;</span>
									<span className="vrm-card-label">{v.label}</span>
								</>
							)}
						</button>
					))}
					{customVrms.map((path) => (
						<CustomAssetCard
							key={path}
							type="vrm"
							path={path}
							isSelected={vrmModel === path}
							onSelect={() => handleVrmSelect(path)}
							onDelete={() => {
								setCustomVrms((prev) => prev.filter((p) => p !== path));
								if (vrmModel === path) {
									handleVrmSelect(AVATAR_PRESETS[0].path);
								}
							}}
						/>
					))}
					<button
						type="button"
						className="vrm-card vrm-card-add"
						onClick={handlePickVrmFile}
						title={t("settings.vrmCustom")}
					>
						<span className="vrm-card-icon">+</span>
						<span className="vrm-card-label">{t("settings.vrmCustom")}</span>
					</button>
				</div>
			</div>

			<div className="settings-field">
				<label>{t("settings.background")}</label>
				<div className="bg-picker">
					<button
						type="button"
						className={`bg-card ${!backgroundImage ? "active" : ""}`}
						onClick={() => handleBgSelect("")}
						title={t("settings.bgNone")}
					>
						<span
							className="bg-card-preview"
							style={{
								background: "linear-gradient(180deg, #1a1412 0%, #0F172A 100%)",
							}}
						/>
						<span className="bg-card-label">{t("settings.bgNone")}</span>
					</button>
					{BG_SAMPLES.map((bg) => (
						<button
							key={bg.path}
							type="button"
							className={`bg-card ${backgroundImage === bg.path ? "active" : ""}`}
							onClick={() => handleBgSelect(bg.path)}
							title={bg.label}
						>
							<span
								className="bg-card-preview"
								style={{ backgroundImage: `url(${bg.path})` }}
							/>
							<span className="bg-card-label">{bg.label}</span>
						</button>
					))}
					{customBgs.map((path) => (
						<CustomAssetCard
							key={path}
							type="bg"
							path={path}
							isSelected={backgroundImage === path}
							onSelect={() => handleBgSelect(path)}
							onDelete={() => {
								setCustomBgs((prev) => prev.filter((p) => p !== path));
								if (backgroundImage === path) {
									handleBgSelect("");
								}
							}}
						/>
					))}
					<button
						type="button"
						className="bg-card bg-card-add"
						onClick={handlePickBgFile}
						title={t("settings.bgCustom")}
					>
						<span className="bg-card-preview bg-card-add-icon">+</span>
						<span className="bg-card-label">{t("settings.bgCustom")}</span>
					</button>
				</div>
			</div>

			<div className="settings-section-divider">
				<span>{t("settings.personaSection")}</span>
			</div>

			<div className="settings-field">
				<label>{t("settings.agentName")}</label>
				<input
					type="text"
					className="settings-input"
					value={agentName}
					onChange={(e) => setAgentName(e.target.value)}
					placeholder="Naia"
				/>
			</div>
			<div className="settings-field">
				<label>{t("settings.userName")}</label>
				<input
					type="text"
					className="settings-input"
					value={userName}
					onChange={(e) => setUserName(e.target.value)}
				/>
			</div>
			{FORMALITY_LOCALES.has(locale) && (
				<>
					<div className="settings-field">
						<label>{t("settings.honorific")}</label>
						<input
							type="text"
							className="settings-input"
							value={honorific}
							onChange={(e) => setHonorific(e.target.value)}
							placeholder={t("onboard.speechStyle.honorificPlaceholder")}
						/>
					</div>
					<div className="settings-field">
						<label>{t("settings.speechStyle")}</label>
						<select
							className="settings-select"
							data-testid="settings-speech-style"
							value={speechStyle}
							onChange={(e) => setSpeechStyle(e.target.value)}
						>
							<option value="casual">{t("onboard.speechStyle.casual")} (Casual)</option>
							<option value="formal">{t("onboard.speechStyle.formal")} (Formal)</option>
						</select>
					</div>
				</>
			)}

			<div className="settings-field">
				<label htmlFor="persona-input">{t("settings.persona")}</label>
				<textarea
					id="persona-input"
					className="settings-persona-textarea"
					value={persona}
					onChange={(e) => setPersona(e.target.value)}
					rows={6}
				/>
				<div className="settings-hint">{t("settings.personaHint")}</div>
			</div>

				{provider !== "nextain" && (
					<>
						<div className="settings-section-divider">
							<span>{t("settings.labSection")}</span>
						</div>

						<div className="settings-field">
							<label>
								{naiaKey
									? t("settings.labConnected")
									: t("settings.labDisconnected")}
							</label>
							{naiaKey ? (
								<div className="lab-info-block">
							{naiaUserId && <span className="lab-user-id">{naiaUserId}</span>}
							<div className="lab-balance-row">
								<span className="lab-balance-label">
								{t("settings.labBalance")}
							</span>
							<span className="lab-balance-value">
								{labBalanceLoading
									? t("settings.labBalanceLoading")
									: labBalanceError
										? t("cost.labError")
										: labBalance !== null
											? `${labBalance.toFixed(2)} ${t("cost.labCredits")}`
											: "-"}
							</span>
						</div>
						<div className="lab-actions-row">
							<button
								type="button"
								className="voice-preview-btn"
								onClick={() =>
									openUrl(`https://naia.nextain.io/${locale}/dashboard`).catch(
										() => {},
									)
								}
							>
								{t("settings.labDashboard")}
							</button>
							<button
								type="button"
								className="voice-preview-btn"
								onClick={() =>
									openUrl(`https://naia.nextain.io/${locale}/billing`).catch(() => {})
								}
							>
								{t("cost.labCharge")}
							</button>
							{showLabDisconnect ? (
								<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
									<p className="reset-confirm-msg">
										{t("settings.labDisconnectConfirm")}
									</p>
									<div className="reset-confirm-actions">
										<button
											type="button"
											className="settings-reset-btn"
											onClick={async () => {
												setNaiaKeyState("");
												setNaiaUserIdState("");
												setLabBalance(null);
													setProvider("gemini");
													setModel(getDefaultLlmModel("gemini"));
												setDiscordDefaultUserId("");
												setDiscordDmChannelId("");
												setDiscordDefaultTarget("");
												setShowLabDisconnect(false);
												await deleteSecretKey("naiaKey");
												const current = loadConfig();
												if (current) {
													saveConfig({
														...current,
														provider:
															current.provider === "nextain"
																? "gemini"
																: current.provider,
														model:
															current.provider === "nextain"
																? getDefaultLlmModel("gemini")
																: current.model,
														// Reset Naia-dependent STT/TTS to defaults
														ttsProvider:
															current.ttsProvider === "nextain"
																? "edge"
																: current.ttsProvider,
														sttProvider:
															current.sttProvider === "nextain"
																? ""
																: current.sttProvider,
														naiaKey: undefined,
														naiaUserId: undefined,
														discordDefaultUserId: undefined,
														discordDmChannelId: undefined,
														discordDefaultTarget: undefined,
													});
												}
												// Sync cleared Discord config to Gateway
												const updated = loadConfig();
												if (updated) {
													await syncToOpenClaw(
														updated.provider || "gemini",
														updated.model || getDefaultLlmModel("gemini"),
														updated.apiKey,
														updated.persona,
														updated.agentName,
														updated.userName,
														undefined,
														updated.locale,
														undefined, // discordDmChannelId cleared
														undefined, // discordDefaultUserId cleared
														updated.ttsProvider,
														updated.ttsVoice,
														undefined,
														undefined,
														undefined, // naiaKey cleared
													);
													await restartGateway();
												}
											}}
										>
											{t("settings.labDisconnect")}
										</button>
										<button
											type="button"
											className="settings-cancel-btn"
											onClick={() => setShowLabDisconnect(false)}
										>
											{t("settings.cancel")}
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									className="voice-preview-btn lab-disconnect-btn"
									onClick={() => setShowLabDisconnect(true)}
								>
									{t("settings.labDisconnect")}
								</button>
							)}
						</div>
								</div>
							) : (
								<button
									type="button"
									className="voice-preview-btn"
									disabled={labWaiting}
									onClick={startLabLogin}
								>
									{labWaiting
										? t("onboard.lab.waiting")
										: t("settings.labConnect")}
								</button>
							)}
						</div>
					</>
				)}

			<div className="settings-section-divider">
				<span>{t("settings.aiSection")}</span>
			</div>

			<div className="settings-field">
				<label htmlFor="provider-select">{t("settings.provider")}</label>
				<select
					id="provider-select"
					value={provider}
					onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
				>
					{LLM_PROVIDERS.map((p) => (
						<option key={p.id} value={p.id} disabled={p.disabled}>
							{p.name}
						</option>
					))}
				</select>
			</div>

			<div className="settings-field">
				<label htmlFor="model-select">{t("settings.model")}</label>
				<select
					id="model-select"
					value={hasSelectedModel ? model : "__custom__"}
					onChange={(e) => {
						if (e.target.value === "__custom__") return;
						setModel(e.target.value);
						// When switching to an omni model, set default voice if not already set
						const newMeta = providerModels.find((m) => m.id === e.target.value);
						if (newMeta?.type === "omni" && newMeta.voices?.length) {
							const currentVoiceValid = newMeta.voices.some((v) => v.id === voice);
							if (!currentVoiceValid) {
								setVoice(newMeta.voices[0].id);
							}
						}
					}}
				>
					{!hasSelectedModel && model ? (
						<option value="__custom__">{`${model} (현재값)`}</option>
					) : null}
					{providerModels.map((m) => (
						<option key={m.id} value={m.id}>
							{formatModelLabel(m)}
						</option>
					))}
				</select>
				<div className="settings-hint">
					{selectedModelMeta?.label ?? model}
				</div>
			</div>

			{/* Omni model voice selection */}
			{isSelectedOmni && omniVoices && omniVoices.length > 0 && (
				<div className="settings-field">
					<label htmlFor="omni-voice-select">{t("settings.naiaVoice")}</label>
					<div className="voice-picker">
						<select
							id="omni-voice-select"
							value={voice}
							onChange={(e) => {
								setVoice(e.target.value);
								if (existing) saveConfig({ ...existing, voice: e.target.value });
							}}
						>
							{omniVoices.map((v) => (
								<option key={v.id} value={v.id}>{v.label}</option>
							))}
						</select>
						<button
							type="button"
							className="voice-preview-btn"
							onClick={handleVoicePreview}
							disabled={isPreviewing}
						>
							{isPreviewing
								? t("settings.voicePreviewing")
								: t("settings.voicePreview")}
						</button>
					</div>
				</div>
			)}

			{/* Omni model: Gemini Direct mode needs Google API Key */}
			{isSelectedOmni && provider === "gemini" && (
				<div className="settings-field">
					<label htmlFor="google-apikey-input">Google API Key</label>
					<input
						id="google-apikey-input"
						type="password"
						value={googleApiKey}
						onChange={(e) => {
							setGoogleApiKey(e.target.value);
							if (existing) saveConfig({ ...existing, googleApiKey: e.target.value });
						}}
						placeholder="AIza..."
					/>
				</div>
			)}

			{/* Omni model: OpenAI Realtime needs API Key */}
			{isSelectedOmni && provider === "openai" && (
				<div className="settings-field">
					<label>OpenAI API Key</label>
					<input
						type="password"
						value={openaiRealtimeApiKey}
						onChange={(e) => {
							setOpenaiRealtimeApiKey(e.target.value);
							if (existing) saveConfig({ ...existing, openaiRealtimeApiKey: e.target.value });
						}}
						placeholder="sk-..."
					/>
				</div>
			)}

			{provider === "nextain" ? (
				<div className="settings-field">
					<label>{t("settings.labSection")}</label>
					<div className="settings-hint">
						Naia 계정 로그인으로 API 키 없이 사용할 수 있습니다.
					</div>
						{naiaKey ? (
							<div className="lab-info-block">
								<span className="settings-hint">
									로그인됨{naiaUserId ? ` (${naiaUserId})` : ""}
								</span>
								<div className="lab-balance-row">
									<span className="lab-balance-label">{t("settings.labBalance")}</span>
									<span className="lab-balance-value">
										{labBalanceLoading
											? t("settings.labBalanceLoading")
											: labBalanceError
												? t("cost.labError")
												: labBalance !== null
													? `${labBalance.toFixed(2)} ${t("cost.labCredits")}`
													: "-"}
									</span>
								</div>
								<div className="lab-actions-row">
								<button
									type="button"
									className="voice-preview-btn"
									onClick={() =>
										openUrl(`https://naia.nextain.io/${locale}/dashboard`).catch(() => {})
									}
								>
									{t("settings.labDashboard")}
								</button>
								<button
									type="button"
									className="voice-preview-btn"
									onClick={() =>
										openUrl(`https://naia.nextain.io/${locale}/billing`).catch(() => {})
									}
								>
									{t("cost.labCharge")}
								</button>
								{showLabDisconnect ? (
									<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
										<p className="reset-confirm-msg">
											{t("settings.labDisconnectConfirm")}
										</p>
										<div className="reset-confirm-actions">
											<button
												type="button"
												className="settings-reset-btn"
												onClick={async () => {
													setNaiaKeyState("");
													setNaiaUserIdState("");
													setLabBalance(null);
													setProvider("gemini");
													setModel(getDefaultLlmModel("gemini"));
													setDiscordDefaultUserId("");
													setDiscordDmChannelId("");
													setDiscordDefaultTarget("");
													setShowLabDisconnect(false);
													await deleteSecretKey("naiaKey");
													const current = loadConfig();
													if (current) {
														saveConfig({
															...current,
															provider:
																current.provider === "nextain"
																	? "gemini"
																	: current.provider,
															model:
																current.provider === "nextain"
																	? getDefaultLlmModel("gemini")
																	: current.model,
															ttsProvider:
																current.ttsProvider === "nextain"
																	? "edge"
																	: current.ttsProvider,
															sttProvider:
																current.sttProvider === "nextain"
																	? ""
																	: current.sttProvider,
															naiaKey: undefined,
															naiaUserId: undefined,
															discordDefaultUserId: undefined,
															discordDmChannelId: undefined,
															discordDefaultTarget: undefined,
														});
													}
													// Sync cleared Discord config to Gateway
													const updated = loadConfig();
													if (updated) {
														await syncToOpenClaw(
															updated.provider || "gemini",
															updated.model || getDefaultLlmModel("gemini"),
															updated.apiKey,
															updated.persona,
															updated.agentName,
															updated.userName,
															undefined,
															updated.locale,
															undefined, // discordDmChannelId cleared
															undefined, // discordDefaultUserId cleared
															updated.ttsProvider,
															updated.ttsVoice,
															undefined,
															undefined,
															undefined, // naiaKey cleared
														);
														await restartGateway();
													}
												}}
											>
												{t("settings.labDisconnect")}
											</button>
											<button
												type="button"
												className="settings-cancel-btn"
												onClick={() => setShowLabDisconnect(false)}
											>
												{t("settings.cancel")}
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										className="voice-preview-btn lab-disconnect-btn"
										onClick={() => setShowLabDisconnect(true)}
									>
										{t("settings.labDisconnect")}
									</button>
								)}
								{showReOnboarding ? (
									<div className="reset-confirm-panel" style={{ marginTop: 8 }}>
										<p className="reset-confirm-msg">
											{t("settings.reOnboardingConfirm")}
										</p>
										<div className="reset-confirm-actions">
											<button
												type="button"
												className="settings-reset-btn"
												onClick={async () => {
													// Delete online config first, then reload
													if (naiaKey && naiaUserId) {
														await clearLabConfig(naiaKey, naiaUserId);
													}
													// Reset local onboarding state
													const current = loadConfig();
													if (current) {
														saveConfig({
															...current,
															onboardingComplete: undefined,
															userName: undefined,
															agentName: undefined,
															persona: undefined,
															honorific: undefined,
															speechStyle: undefined,
														});
													}
													// Reload to trigger onboarding
													window.location.reload();
												}}
											>
												{t("settings.reOnboardingContinue")}
											</button>
											<button
												type="button"
												className="settings-cancel-btn"
												onClick={() => setShowReOnboarding(false)}
											>
												{t("settings.cancel")}
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										className="voice-preview-btn re-onboarding-btn"
										onClick={() => setShowReOnboarding(true)}
									>
										{t("settings.reOnboarding")}
									</button>
								)}
								</div>
							</div>
						) : (
						<button
							type="button"
							className="voice-preview-btn"
							disabled={labWaiting}
							onClick={startLabLogin}
						>
							{labWaiting ? t("onboard.lab.waiting") : t("settings.labConnect")}
						</button>
					)}
					{error && <div className="settings-error">{error}</div>}
				</div>
				) : provider === "ollama" ? (
					<div className="settings-field">
						<label>Ollama Host</label>
						<input
							type="text"
							value={ollamaHost}
							onChange={(e) => setOllamaHost(e.target.value)}
							placeholder={DEFAULT_OLLAMA_HOST}
						/>
						<div className="settings-hint">
							{ollamaConnected
								? `연결됨 — ${(dynamicModels.ollama ?? []).length}개 모델`
								: "연결 안 됨 — Ollama 서버가 실행 중인지 확인하세요"}
						</div>
						{error && <div className="settings-error">{error}</div>}
					</div>
				) : provider === "claude-code-cli" ? (
					<div className="settings-field">
						<label>{t("settings.apiKey")}</label>
						<div className="settings-hint">
							Claude Code CLI provider는 로컬 CLI 로그인 세션을 사용합니다.
						</div>
						{error && <div className="settings-error">{error}</div>}
					</div>
				) : (
					<div className="settings-field">
						<label htmlFor="apikey-input">{t("settings.apiKey")}</label>
					<input
						id="apikey-input"
						type="password"
						value={apiKey}
						onChange={(e) => {
							setApiKey(e.target.value);
							setError("");
						}}
						placeholder="sk-..."
					/>
					{error && <div className="settings-error">{error}</div>}
				</div>
			)}

			{/* Voice settings — only for LLM models (omni models have built-in STT/TTS) */}
			{!isSelectedOmni && (
				<>
					<div className="settings-section-divider">
						<span>{t("settings.voiceSection")}</span>
					</div>

					{/* Voice status summary */}
					<div className="settings-field" style={{ fontSize: "0.85em", opacity: 0.8, lineHeight: 1.6 }}>
						{!sttProvider && <div>{t("settings.voiceStatusSttNeeded")}</div>}
						{sttProvider && !sttModel && <div>{t("settings.voiceStatusModelNeeded")}</div>}
						{sttProvider && sttModel && !ttsEnabled && <div>{t("settings.voiceStatusTtsOff")}</div>}
						{sttProvider && sttModel && ttsEnabled && <div style={{ color: "var(--success-color, #4caf50)" }}>{t("settings.voiceStatusReady")}</div>}
					</div>

					{/* STT Provider */}
					<div className="settings-field">
						<label>{t("settings.sttProvider")}</label>
						<select
							value={sttProvider}
							onChange={(e) => {
								const next = e.target.value as SttProviderId;
								setSttProvider(next);
								// Clear model selection when switching engine type
								setSttModel("");
							}}
						>
							<option value="">{t("settings.sttNone")}</option>
							{listSttProviders().map((p) => (
								<option key={p.id} value={p.id} disabled={p.requiresNaiaKey && !naiaKey}>
									{p.name}{p.pricing ? ` — ${p.pricing}` : ""}{p.requiresNaiaKey && !naiaKey ? ` (${t("settings.ttsNaiaRequired")})` : ""}
								</option>
							))}
						</select>
					</div>
					{/* Naia Cloud STT — backend engine selector */}
					{sttProvider === "nextain" && naiaKey && (
						<div className="settings-field">
							<label>{t("settings.naiaCloudBackend")}</label>
							<select
								value={existing?.naiaCloudSttBackend ?? "google-cloud-stt"}
								onChange={(e) => {
									if (existing) saveConfig({ ...existing, naiaCloudSttBackend: e.target.value });
								}}
							>
								<option value="google-cloud-stt">Google Cloud STT</option>
							</select>
						</div>
					)}
					{/* STT API key — shown for API-based providers */}
					{(() => {
						const sttMeta = listSttProviders().find((p) => p.id === sttProvider);
						if (sttMeta?.requiresNaiaKey && !naiaKey) {
							return (
								<div className="settings-field">
									<span className="settings-hint">{t("settings.ttsNaiaRequired")}</span>
								</div>
							);
						}
						if (sttMeta?.requiresApiKey) {
							const currentKey = sttMeta.apiKeyConfigField === "googleApiKey"
								? (existing?.googleApiKey ?? "")
								: sttMeta.apiKeyConfigField === "elevenlabsApiKey"
									? (existing?.elevenlabsApiKey ?? "")
									: "";
							return (
								<div className="settings-field">
									<label htmlFor="stt-api-key">{t("settings.sttApiKey")}</label>
									<input
										id="stt-api-key"
										type="password"
										defaultValue={currentKey}
										onChange={(e) => {
											if (sttMeta.apiKeyConfigField === "googleApiKey") {
												setGatewayTtsApiKey(e.target.value);
											}
										}}
										placeholder={`${sttMeta.name} API Key`}
									/>
								</div>
							);
						}
						return null;
					})()}

					{/* STT Model — current selection + manage button (offline engines only) */}
					{(sttProvider === "vosk" || sttProvider === "whisper") && (
						<div className="settings-field">
							<label>{t("settings.sttCurrentModel")}</label>
							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<span style={{ fontSize: "0.9em" }}>
									{sttModel
										? sttModels.find((m) => m.modelId === sttModel)?.modelName ?? sttModel
										: "—"}
								</span>
								<button
									type="button"
									className="onboarding-next-btn"
									style={{ fontSize: "0.8em", padding: "4px 12px" }}
									onClick={() => setSttModelModalOpen(true)}
								>
									{t("settings.sttManageModels")}
								</button>
							</div>
						</div>
					)}

					{/* TTS */}
					<div className="settings-field settings-toggle-row">
						<label htmlFor="tts-toggle">{t("settings.ttsEnabled")}</label>
						<input
							id="tts-toggle"
							type="checkbox"
							checked={ttsEnabled}
							onChange={(e) => setTtsEnabled(e.target.checked)}
						/>
					</div>
					{/* TTS Provider selector */}
					<div className="settings-field">
						<label htmlFor="tts-provider-select">{t("settings.ttsProvider")}</label>
						<select
							id="tts-provider-select"
							data-testid="gateway-tts-provider"
							value={ttsProvider}
							onChange={(e) => {
								const next = e.target.value as TtsProviderId;
								setTtsProvider(next);
								setDynamicTtsVoices([]);
								// Load API key for the selected provider
								if (next === "openai") setGatewayTtsApiKey(existing?.openaiTtsApiKey ?? "");
								else if (next === "elevenlabs") setGatewayTtsApiKey(existing?.elevenlabsApiKey ?? "");
								else if (next === "google") setGatewayTtsApiKey(existing?.googleApiKey ?? "");
								else setGatewayTtsApiKey("");
								// Reset voice to provider default
								const meta = listTtsProviderMetas().find((p) => p.id === next);
								if (meta?.voices?.[0]) {
									persistTtsVoice(meta.voices[0].id);
								} else if (next === "edge") {
									// Edge voice will be selected from gateway/hardcoded list
									persistTtsVoice("");
								}
								// Fetch dynamic voices — use saved key or current input
								const savedKey = next === "openai" ? (existing?.openaiTtsApiKey ?? "")
									: next === "elevenlabs" ? (existing?.elevenlabsApiKey ?? "")
									: next === "google" ? (existing?.googleApiKey ?? "")
									: "";
								const effectiveKey = savedKey || gatewayTtsApiKey;
								if (meta?.fetchVoices && effectiveKey) {
									meta.fetchVoices(effectiveKey).then((voices) => {
										if (voices && voices.length > 0) {
											setDynamicTtsVoices(voices);
											if (voices[0] && !meta.voices?.length) persistTtsVoice(voices[0].id);
										}
									});
								}
							}}
						>
							{listTtsProviderMetas().map((p) => (
								<option key={p.id} value={p.id} disabled={p.requiresNaiaKey && !naiaKey}>
									{p.name}{p.pricing ? ` — ${p.pricing}` : ""}{p.requiresNaiaKey && !naiaKey ? ` (${t("settings.ttsNaiaRequired")})` : ""}
								</option>
							))}
						</select>
					</div>
					{/* Naia Cloud TTS — backend engine selector */}
					{ttsProvider === "nextain" && naiaKey && (
						<div className="settings-field">
							<label>{t("settings.naiaCloudBackend")}</label>
							<select
								value={existing?.naiaCloudTtsBackend ?? "google-chirp3-hd"}
								onChange={(e) => {
									if (existing) saveConfig({ ...existing, naiaCloudTtsBackend: e.target.value });
								}}
							>
								<option value="google-chirp3-hd">Google Chirp 3 HD</option>
							</select>
						</div>
					)}
					{/* TTS API key input — shown when provider requires it */}
					{(() => {
						const providerMeta = listTtsProviderMetas().find((p) => p.id === ttsProvider);
						if (providerMeta?.requiresApiKey) {
							return (
								<div className="settings-field">
									<label htmlFor="tts-api-key">{t("settings.ttsApiKey")}</label>
									<input
										id="tts-api-key"
										type="password"
										value={gatewayTtsApiKey}
										onChange={(e) => {
											const val = e.target.value;
											setGatewayTtsApiKey(val);
											const meta = listTtsProviderMetas().find((p) => p.id === ttsProvider);
											if (meta?.fetchVoices && val.length > 10) {
												meta.fetchVoices(val).then((voices) => {
													if (voices && voices.length > 0) setDynamicTtsVoices(voices);
												});
											}
										}}
										onPaste={(e) => {
											// Handle paste — onChange may not fire in WebKitGTK
											setTimeout(() => {
												const val = (e.target as HTMLInputElement).value;
												if (val.length > 10) {
													const meta = listTtsProviderMetas().find((p) => p.id === ttsProvider);
													meta?.fetchVoices?.(val).then((voices) => {
														if (voices && voices.length > 0) setDynamicTtsVoices(voices);
													});
												}
											}, 100);
										}}
										placeholder={`${providerMeta.name} API Key`}
									/>
								</div>
							);
						}
						if (providerMeta?.requiresNaiaKey && !naiaKey) {
							return (
								<div className="settings-field">
									<span className="settings-hint">{t("settings.ttsNaiaRequired")}</span>
								</div>
							);
						}
						return null;
					})()}
					{/* TTS Voice picker — dynamic based on provider */}
					{(() => {
						const providerMeta = listTtsProviderMetas().find((p) => p.id === ttsProvider);
						// Edge: use locale-based hardcoded voice list
						if (ttsProvider === "edge") {
							const voices = getEdgeVoicesForLocale(locale);
							return voices.length > 0 ? (
								<div className="settings-field">
									<label htmlFor="tts-voice-select">{t("settings.ttsVoice")}</label>
									<div className="voice-picker">
										<select
											id="tts-voice-select"
											data-testid="gateway-tts-voice"
											value={ttsVoice}
											onChange={(e) => persistTtsVoice(e.target.value)}
										>
											{voices.map((v) => (
												<option key={v} value={v}>{v}</option>
											))}
										</select>
										<button
											type="button"
											className="voice-preview-btn"
											onClick={handleVoicePreview}
											disabled={isPreviewing}
										>
											{isPreviewing
												? t("settings.voicePreviewing")
												: t("settings.voicePreview")}
										</button>
									</div>
								</div>
							) : null;
						}
						// Other providers: use dynamic voices (if fetched) or static registry voices
						const voiceList = dynamicTtsVoices.length > 0 ? dynamicTtsVoices : (providerMeta?.voices ?? []);
						if (voiceList.length > 0) {
							return (
								<div className="settings-field">
									<label htmlFor="tts-voice-select">{t("settings.ttsVoice")}</label>
									<div className="voice-picker">
										<select
											id="tts-voice-select"
											value={ttsVoice}
											onChange={(e) => persistTtsVoice(e.target.value)}
										>
											{voiceList.map((v) => (
												<option key={v.id} value={v.id}>{v.label}</option>
											))}
										</select>
										<button
											type="button"
											className="voice-preview-btn"
											onClick={handleVoicePreview}
											disabled={isPreviewing}
										>
											{isPreviewing
												? t("settings.voicePreviewing")
												: t("settings.voicePreview")}
										</button>
									</div>
								</div>
							);
						}
						return null;
					})()}
				</>
			)}

			<div className="settings-section-divider">
				<span>{t("settings.toolsSection")}</span>
			</div>

			<div className="settings-field settings-toggle-row">
				<label htmlFor="tools-toggle">{t("settings.enableTools")}</label>
				<input
					id="tools-toggle"
					type="checkbox"
					checked={enableTools}
					onChange={(e) => setEnableTools(e.target.checked)}
				/>
			</div>

			<div className="settings-field">
				<label htmlFor="gateway-url-input">{t("settings.gatewayUrl")}</label>
				<input
					id="gateway-url-input"
					type="text"
					value={gatewayUrl}
					onChange={(e) => setGatewayUrl(e.target.value)}
					placeholder="ws://localhost:18789"
				/>
			</div>

			<div className="settings-field">
				<label htmlFor="gateway-token-input">
					{t("settings.gatewayToken")}
				</label>
				<input
					id="gateway-token-input"
					type="password"
					value={gatewayToken}
					onChange={(e) => setGatewayToken(e.target.value)}
				/>
			</div>

			{/* Discord ID / target — managed via Channels tab & OAuth deep link */}

			{allowedToolsCount > 0 && (
				<div className="settings-field">
					<label>
						{t("settings.allowedTools")} ({allowedToolsCount})
					</label>
					<button
						type="button"
						className="voice-preview-btn"
						onClick={() => {
							clearAllowedTools();
							setAllowedToolsCount(0);
						}}
					>
						{t("settings.clearAllowedTools")}
					</button>
				</div>
			)}

			{enableTools && (
				<>
					<div className="settings-section-divider">
						<span>{t("settings.channelsSection")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">{t("settings.channelsHint")}</span>
					</div>

					{/* Discord channel card */}
					<div className="channel-card" data-testid="discord-settings-card">
						<div className="channel-card-header">
							<span className="channel-name">Discord</span>
							<span
								className={`channel-status-badge ${discordBotConnected ? "connected" : "disconnected"}`}
								data-testid="channel-status"
							>
								{discordBotConnected
									? t("channels.connected")
									: discordBotLoading
										? "..."
										: t("channels.disconnected")}
							</span>
						</div>
						<div className="settings-field" style={{ marginBottom: 6 }}>
							<div style={{ display: "flex", gap: 8 }}>
								<button
									type="button"
									className="voice-preview-btn"
									onClick={handleDiscordBotConnect}
									disabled={discordBotLoading}
								>
									{discordBotLoading ? t("settings.discordBotConnecting") : discordBotConnected ? t("settings.discordBotReconnect") : t("settings.discordBotConnect")}
								</button>
								<button
									type="button"
									className="voice-preview-btn"
									onClick={() => fetchDiscordBotStatus()}
									disabled={discordBotLoading}
								>
									{t("settings.discordCheckStatus")}
								</button>
							</div>
						</div>
						<div className="settings-field">
							<label htmlFor="discord-user-id">Discord User ID</label>
							<input
								id="discord-user-id"
								type="text"
								value={discordDefaultUserId}
								onChange={(e) => setDiscordDefaultUserId(e.target.value)}
								placeholder={t("settings.discordUserIdPlaceholder")}
							/>
						</div>
						<div className="settings-field">
							<label htmlFor="discord-dm-channel-id">Discord DM Channel ID</label>
							<input
								id="discord-dm-channel-id"
								type="text"
								value={discordDmChannelId}
								onChange={(e) => setDiscordDmChannelId(e.target.value)}
								placeholder={t("settings.discordDmChannelIdPlaceholder")}
							/>
						</div>
					</div>

					<div className="settings-section-divider">
						<span>{t("settings.voiceConversation")}</span>
					</div>
					<div className="settings-field">
						<span className="settings-hint">{t("settings.voiceWakeHint")}</span>
					</div>
					{voiceWakeLoading ? (
						<div className="settings-field">
							<span className="settings-hint">
								{t("settings.voiceWakeLoading")}
							</span>
						</div>
					) : (
						<>
							<div className="settings-field">
								<label>{t("settings.voiceWakeTriggers")}</label>
								<div
									className="voice-wake-triggers"
									data-testid="voice-wake-triggers"
								>
									{voiceWakeTriggers.map((trigger) => (
										<span key={trigger} className="voice-wake-tag">
											{trigger}
											<button
												type="button"
												className="voice-wake-tag-remove"
												onClick={() => handleVoiceWakeRemove(trigger)}
											>
												×
											</button>
										</span>
									))}
								</div>
							</div>
							<div className="settings-field voice-wake-add-row">
								<input
									type="text"
									data-testid="voice-wake-input"
									value={voiceWakeInput}
									onChange={(e) => setVoiceWakeInput(e.target.value)}
									placeholder={t("settings.voiceWakePlaceholder")}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleVoiceWakeAdd();
									}}
								/>
								<button type="button" onClick={handleVoiceWakeAdd}>
									{t("settings.voiceWakeAdd")}
								</button>
							</div>
							<div className="settings-field">
								<button
									type="button"
									className="voice-preview-btn"
									data-testid="voice-wake-save"
									onClick={handleVoiceWakeSave}
								>
									{voiceWakeSaved
										? t("settings.voiceWakeSaved")
										: t("settings.voiceWakeSave")}
								</button>
							</div>
						</>
					)}
				</>
			)}

			{enableTools && <DevicePairingSection />}

			<div className="settings-section-divider">
				<span>{t("settings.memorySection")}</span>
			</div>

			{facts.length === 0 ? (
				<div className="settings-field">
					<span className="settings-hint">{t("settings.factsEmpty")}</span>
				</div>
			) : (
				<div className="facts-list">
					{facts.map((f) => (
						<div key={f.id} className="fact-item">
							<div className="fact-content">
								<span className="fact-key">{f.key}</span>
								<span className="fact-value">{f.value}</span>
							</div>
							<button
								type="button"
								className="fact-delete-btn"
								onClick={async () => {
									try {
										await deleteFact(f.id);
										setFacts((prev) => prev.filter((x) => x.id !== f.id));
									} catch (err) {
										Logger.warn("SettingsTab", "Failed to delete fact", {
											error: String(err),
										});
									}
								}}
							>
								{t("settings.factDelete")}
							</button>
						</div>
					))}
				</div>
			)}

			<div className="settings-danger-zone">
				{showResetConfirm ? (
					<div className="reset-confirm-panel">
						<p className="reset-confirm-msg">{t("settings.resetConfirm")}</p>
						<label className="reset-confirm-checkbox">
							<input
								type="checkbox"
								checked={resetClearHistory}
								onChange={(e) => setResetClearHistory(e.target.checked)}
							/>
							{t("settings.resetClearHistory")}
						</label>
						<div className="reset-confirm-actions">
							<button
								type="button"
								className="settings-reset-btn"
								onClick={executeReset}
							>
								{t("settings.resetExecute")}
							</button>
							<button
								type="button"
								className="settings-cancel-btn"
								onClick={() => {
									setShowResetConfirm(false);
								}}
							>
								{t("settings.cancel")}
							</button>
						</div>
					</div>
				) : (
					<button
						type="button"
						className="settings-reset-btn"
						onClick={handleReset}
					>
						{t("settings.reset")}
					</button>
				)}
			</div>

			<div className="settings-actions">
				<button
					type="button"
					className="settings-save-btn"
					onClick={handleSave}
				>
					{saved ? t("settings.saved") : t("settings.save")}
				</button>
			</div>

			<VersionFooter />

			{/* STT Model Manager Modal */}
			{sttModelModalOpen && (
				<div className="sync-dialog-overlay" onClick={() => setSttModelModalOpen(false)}>
					<div className="sync-dialog-card" style={{ maxWidth: "520px", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
						<h3>{t("settings.sttModelManagerTitle")}</h3>
						{sttModels
							.filter((m) => m.engine === sttProvider)
							.map((m) => (
								<div
									key={m.modelId}
									className="stt-model-row"
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: "8px",
										padding: "5px 0",
										borderBottom: "1px solid var(--border-color, #333)",
									}}
								>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
											<input
												type="radio"
												name="stt-model-modal"
												value={m.modelId}
												checked={sttModel === m.modelId}
												disabled={!m.downloaded || !m.ready}
												onChange={() => setSttModel(m.modelId)}
											/>
											<strong style={{ fontSize: "0.9em" }}>{m.modelName}</strong>
											{m.downloaded && <span style={{ color: "var(--success-color, #4caf50)", fontSize: "0.75em" }}>✓</span>}
										</div>
										<div style={{ fontSize: "0.75em", opacity: 0.7, marginLeft: "22px" }}>
											{m.language === "multilingual" ? t("settings.sttLangMultilingual") : m.language} · {m.sizeMb}MB{m.wer && m.wer !== "—" ? ` · WER ${m.wer}` : ""}
											{m.description && ` · ${
												({
													"Fast, low quality. Not recommended for Korean.": t("settings.sttDescWhisperTiny"),
													"Similar quality to Vosk small.": t("settings.sttDescWhisperBase"),
													"Noticeable improvement over Vosk.": t("settings.sttDescWhisperSmall"),
													"Recommended. Good accuracy for Korean.": t("settings.sttDescWhisperMedium"),
													"Best quality. Large download.": t("settings.sttDescWhisperLarge"),
												} as Record<string, string>)[m.description] || m.description
											}`}
										</div>
									</div>
									<div style={{ flexShrink: 0, display: "flex", gap: "4px" }}>
										{!m.downloaded && m.ready && sttDownloading !== m.modelId && (
											<button
												type="button"
												style={{ fontSize: "0.8em", padding: "2px 8px", cursor: "pointer" }}
												onClick={() => handleSttModelDownload(m.modelId)}
											>
												{t("settings.sttModelDownload")}
											</button>
										)}
										{!m.downloaded && !m.ready && (
											<span style={{ fontSize: "0.75em", opacity: 0.5 }}>{t("settings.sttModelNotReady")}</span>
										)}
										{sttDownloading === m.modelId && (
											<span style={{ fontSize: "0.8em" }}>
												{sttDownloadProgress}%
											</span>
										)}
										{m.downloaded && (
											<button
												type="button"
												style={{ fontSize: "0.8em", padding: "2px 8px", cursor: "pointer", color: "var(--error-color, #f44)" }}
												onClick={() => handleSttModelDelete(m.modelId)}
											>
												{t("settings.sttModelDelete")}
											</button>
										)}
									</div>
								</div>
							))}
						<div className="sync-dialog-actions" style={{ marginTop: "12px" }}>
							<button
								type="button"
								className="onboarding-next-btn"
								onClick={() => setSttModelModalOpen(false)}
							>
								OK
							</button>
						</div>
					</div>
				</div>
			)}

			{syncDialogOpen && (
				<div className="sync-dialog-overlay">
					<div className="sync-dialog-card">
						<h3>{t("settings.labSyncDialog.title")}</h3>
						<p>{t("settings.labSyncDialog.message")}</p>
						<div className="sync-dialog-actions">
							<button
								type="button"
								className="onboarding-next-btn"
								onClick={handleSyncDialogApply}
							>
								{t("settings.labSyncDialog.useOnline")}
							</button>
							<button
								type="button"
								className="onboarding-back-btn"
								onClick={() => {
									setSyncDialogOpen(false);
									setSyncDialogOnlineConfig(null);
								}}
							>
								{t("settings.labSyncDialog.keepLocal")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function VersionFooter() {
	const [appVersion, setAppVersion] = useState("");
	const [updateStatus, setUpdateStatus] = useState<
		"idle" | "checking" | "upToDate" | "available" | "failed"
	>("idle");
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

	useEffect(() => {
		import("@tauri-apps/api/app")
			.then(({ getVersion }) => getVersion())
			.then(setAppVersion)
			.catch(() => {});
	}, []);

	const handleCheckUpdate = async () => {
		setUpdateStatus("checking");
		try {
			const info = await checkForUpdate();
			if (info) {
				setUpdateInfo(info);
				setUpdateStatus("available");
			} else {
				setUpdateStatus("upToDate");
			}
		} catch {
			setUpdateStatus("failed");
		}
	};

	const handleInstall = async () => {
		if (!updateInfo) return;
		try {
			await updateInfo.installFn();
		} catch {
			setUpdateStatus("failed");
		}
	};

	return (
		<div className="version-footer">
			<span className="version-footer-text">
				{t("update.version")} {appVersion || "—"}
			</span>
			{updateStatus === "idle" && (
				<button type="button" className="version-footer-btn" onClick={handleCheckUpdate}>
					{t("update.checkNow")}
				</button>
			)}
			{updateStatus === "checking" && (
				<span className="version-footer-status">{t("update.checking")}</span>
			)}
			{updateStatus === "upToDate" && (
				<span className="version-footer-status">{t("update.upToDate")}</span>
			)}
			{updateStatus === "available" && updateInfo && (
				<button type="button" className="version-footer-btn" onClick={handleInstall}>
					{t("update.now")} ({updateInfo.version})
				</button>
			)}
			{updateStatus === "failed" && (
				<span className="version-footer-status">{t("update.failed")}</span>
			)}
		</div>
	);
}
