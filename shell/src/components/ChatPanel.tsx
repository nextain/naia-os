import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
	type RecognitionResult,
	onError as sttOnError,
	onResult as sttOnResult,
	onStateChange as sttOnStateChange,
	startListening as sttStart,
	stopListening as sttStop,
} from "tauri-plugin-stt-api";
import { type AudioPlayer, createAudioPlayer } from "../lib/audio-player";
import { getDefaultVoiceForAvatar } from "../lib/avatar-presets";
import {
	cancelChat,
	directToolCall,
	requestTts,
	sendChatMessage,
} from "../lib/chat-service";
import {
	LAB_GATEWAY_URL,
	addAllowedTool,
	isReadyToChat,
	isToolAllowed,
	loadConfig,
	loadConfigWithSecrets,
	localeToSttLanguage,
	resolveGatewayUrl,
	saveConfig,
} from "../lib/config";
import { getAllFacts, upsertFact } from "../lib/db";
import {
	discoverAndPersistDiscordDmChannel,
	getGatewayHistory,
	patchGatewaySession,
	resetGatewaySession,
} from "../lib/gateway-sessions";
import { getLocale, t } from "../lib/i18n";
import {
	getDefaultLlmModel,
	getLlmModel,
	getLlmProvider,
	isApiKeyOptional,
} from "../lib/llm";
import { Logger } from "../lib/logger";
import { extractFacts, summarizeSession } from "../lib/memory-processor";
import { startMemorySync } from "../lib/memory-sync";
import { type MicStream, createMicStream } from "../lib/mic-stream";
import { restartGateway, syncToOpenClaw } from "../lib/openclaw-sync";
import { type MemoryContext, buildSystemPrompt } from "../lib/persona";
import { createApiSttSession, getSttProvider } from "../lib/stt";
import { estimateSttCost, estimateTtsCost } from "../lib/tts/cost";
import type {
	AgentResponseChunk,
	AuditEvent,
	AuditFilter,
	ChatMessage,
	ProviderId,
} from "../lib/types";
import { AudioQueue } from "../lib/voice/audio-queue";
import {
	LIVE_PROVIDER_COST_HINTS,
	type VoiceSession,
	createVoiceSession,
} from "../lib/voice/index";
import { SentenceChunker } from "../lib/voice/sentence-chunker";
import { parseEmotion } from "../lib/vrm/expression";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";
import { useLogsStore } from "../stores/logs";
import { useProgressStore } from "../stores/progress";
import { useSkillsStore } from "../stores/skills";
import { AgentsTab } from "./AgentsTab";
import { ChannelsTab } from "./ChannelsTab";
import { CostDashboard } from "./CostDashboard";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { HistoryTab } from "./HistoryTab";
import { PermissionModal } from "./PermissionModal";
import { SettingsTab } from "./SettingsTab";
import { SkillsTab } from "./SkillsTab";
import { ToolActivity } from "./ToolActivity";
import { WorkProgressPanel } from "./WorkProgressPanel";

type TabId =
	| "chat"
	| "progress"
	| "skills"
	| "channels"
	| "agents"
	| "diagnostics"
	| "settings"
	| "history";

const TAB_ICONS: Record<TabId, string> = {
	chat: "💬",
	history: "🕘",
	progress: "📊",
	skills: "🧩",
	channels: "🌐",
	agents: "🤖",
	diagnostics: "🩺",
	settings: "⚙️",
};

// Built-in skills are always available in UI (non-toggle). Prevent hidden config drift
// from disabling them via chat-originated config_update events.
const BUILTIN_SKILLS = new Set([
	"skill_time",
	"skill_system_status",
	"skill_memo",
	"skill_weather",
	"skill_notify_slack",
	"skill_notify_discord",
	"skill_notify_google_chat",
	"skill_naia_discord",
	"skill_skill_manager",
	"skill_agents",
	"skill_approvals",
	"skill_botmadang",
	"skill_channels",
	"skill_config",
	"skill_cron",
	"skill_device",
	"skill_diagnostics",
	"skill_sessions",
	"skill_tts",
	"skill_voicewake",
]);

function sanitizeDisabledSkills(disabled?: string[]): string[] | undefined {
	if (!disabled || disabled.length === 0) return undefined;
	const filtered = disabled.filter((name) => !BUILTIN_SKILLS.has(name));
	return filtered.length > 0 ? filtered : undefined;
}

function generateRequestId(): string {
	return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCost(cost: number): string {
	if (cost < 0.001) return `$${cost.toFixed(6)}`;
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(3)}`;
}

/** Summarize a previous session and extract facts (fire-and-forget). */
async function summarizePreviousSession(
	messages: ChatMessage[],
	apiKey: string,
	provider: ProviderId,
) {
	try {
		const rows = messages.map((m) => ({
			id: m.id,
			session_id: "",
			role: m.role,
			content: m.content,
			timestamp: m.timestamp,
			cost_json: null,
			tool_calls_json: null,
		}));
		const summary = await summarizeSession(rows, apiKey, provider);
		if (summary) {
			// Save summary to Gateway session metadata
			await patchGatewaySession("agent:main:main", { summary });
			Logger.info("ChatPanel", "Session summarized via Gateway");

			// Extract facts from summary
			const rawFacts = await extractFacts(rows, summary, apiKey, provider);
			for (const f of rawFacts) {
				const now = Date.now();
				await upsertFact({
					id: `fact-${f.key}-${now}`,
					key: f.key,
					value: f.value,
					source_session: null,
					created_at: now,
					updated_at: now,
				});
			}
			// Sync updated facts to SOUL.md so OpenClaw channels see them
			if (rawFacts.length > 0) {
				const cfg = loadConfig();
				if (cfg) {
					syncToOpenClaw(cfg.provider, cfg.model, cfg.apiKey).catch(() => {});
				}
			}
		}
	} catch (err) {
		Logger.warn("ChatPanel", "Background summarization failed", {
			error: String(err),
		});
	}
}

/** Extract facts from recent messages without full summarization (lightweight). */
async function extractRecentFacts(
	messages: ChatMessage[],
	apiKey: string,
	provider: ProviderId,
) {
	try {
		const rows = messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));
		const rawFacts = await extractFacts(rows, "", apiKey, provider);
		for (const f of rawFacts) {
			const now = Date.now();
			await upsertFact({
				id: `fact-${f.key}-${now}`,
				key: f.key,
				value: f.value,
				source_session: null,
				created_at: now,
				updated_at: now,
			});
		}
		if (rawFacts.length > 0) {
			const cfg = loadConfig();
			if (cfg) {
				syncToOpenClaw(cfg.provider, cfg.model, cfg.apiKey).catch(() => {});
			}
			Logger.info("ChatPanel", "Auto-extracted facts from conversation", {
				count: rawFacts.length,
			});
		}
	} catch (err) {
		Logger.warn("ChatPanel", "Auto fact extraction failed", {
			error: String(err),
		});
	}
}

/** Build MemoryContext for system prompt injection. */
async function buildMemoryContext(): Promise<MemoryContext> {
	const ctx: MemoryContext = {};
	try {
		const cfg = loadConfig();
		ctx.userName = cfg?.userName;
		ctx.agentName = cfg?.agentName;
		ctx.locale = cfg?.locale || getLocale();
		ctx.honorific = cfg?.honorific;
		ctx.speechStyle = cfg?.speechStyle;
		ctx.discordDefaultUserId = cfg?.discordDefaultUserId;
		ctx.discordDmChannelId = cfg?.discordDmChannelId;

		const facts = await getAllFacts();
		if (facts && facts.length > 0) {
			ctx.facts = facts;
		}
	} catch (err) {
		Logger.warn("ChatPanel", "Failed to build memory context", {
			error: String(err),
		});
	}
	return ctx;
}

// Keep reference to prevent garbage collection during playback
let currentAudio: HTMLAudioElement | null = null;

/** Play base64 MP3 via HTML Audio element (reliable in webkit2gtk). */
function playBase64Audio(base64: string): void {
	Logger.info("ChatPanel", "Audio chunk received", {
		length: base64.length,
	});
	const avatarStore = useAvatarStore.getState();
	avatarStore.setSpeaking(true);
	avatarStore.setPendingAudio(base64);

	// Stop previous audio if still playing
	if (currentAudio) {
		currentAudio.pause();
		currentAudio = null;
	}

	const audio = new Audio(`data:audio/mp3;base64,${base64}`);
	currentAudio = audio; // prevent GC
	audio.onended = () => {
		Logger.info("ChatPanel", "Audio playback ended");
		currentAudio = null;
		avatarStore.setSpeaking(false);
	};
	audio.onerror = (e) => {
		Logger.warn("ChatPanel", "Audio playback error", {
			error: String(e),
		});
		currentAudio = null;
		avatarStore.setSpeaking(false);
	};
	audio.play().then(
		() => Logger.info("ChatPanel", "Audio play() started"),
		(err) => {
			Logger.warn("ChatPanel", "Audio play() rejected", {
				error: String(err),
			});
			currentAudio = null;
			avatarStore.setSpeaking(false);
		},
	);
}

function sendApprovalResponse(
	requestId: string,
	toolCallId: string,
	decision: "once" | "always" | "reject",
): void {
	const message = JSON.stringify({
		type: "approval_response",
		requestId,
		toolCallId,
		decision,
	});
	invoke("send_to_agent_command", { message }).catch((err) => {
		Logger.warn("ChatPanel", "Failed to send approval response", {
			error: String(err),
		});
	});
}

export function ChatPanel() {
	const [input, setInput] = useState("");
	const [activeTab, setActiveTab] = useState<TabId>(
		isReadyToChat() ? "chat" : "settings",
	);
	const [showCostDashboard, setShowCostDashboard] = useState(false);
	const [voiceMode, setVoiceMode] = useState<"off" | "connecting" | "active">(
		"off",
	);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const sessionLoaded = useRef(false);
	const currentRequestId = useRef<string | null>(null);
	const voiceSessionRef = useRef<VoiceSession | null>(null);
	const micStreamRef = useRef<MicStream | null>(null);
	const audioPlayerRef = useRef<AudioPlayer | null>(null);
	const voiceStartRef = useRef<{ time: number; provider: string } | null>(null);
	const lastExtractedIdx = useRef(0);

	// Pipeline voice state (Vosk STT → LLM → sentence TTS → audio queue)
	const pipelineActiveRef = useRef(false);
	const audioQueueRef = useRef<AudioQueue | null>(null);
	const sentenceChunkerRef = useRef<SentenceChunker | null>(null);
	const activeTtsRequestsRef = useRef<Set<string>>(new Set());
	const pipelineVoiceConfigRef = useRef<{
		voice?: string;
		ttsProvider?: string;
		ttsApiKey?: string;
		naiaKey?: string;
	} | null>(null);
	const sttCleanupRef = useRef<(() => void)[]>([]);
	const sttDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sttBufferRef = useRef("");
	const ttsPlayingRef = useRef(false);
	const ttsCooldownUntilRef = useRef(0);
	const [ttsPlaying, setTtsPlaying] = useState(false);
	const [sttPartial, setSttPartial] = useState("");
	const [sttState, setSttState] = useState<
		"idle" | "initializing" | "listening"
	>("idle");

	const messages = useChatStore((s) => s.messages);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const streamingContent = useChatStore((s) => s.streamingContent);
	const streamingThinking = useChatStore((s) => s.streamingThinking);
	const streamingToolCalls = useChatStore((s) => s.streamingToolCalls);
	const totalSessionCost = useChatStore((s) => s.totalSessionCost);
	const sessionCostEntries = useChatStore((s) => s.sessionCostEntries);
	const provider = useChatStore((s) => s.provider);
	const pendingApproval = useChatStore((s) => s.pendingApproval);
	const messageQueue = useChatStore((s) => s.messageQueue);

	const setEmotion = useAvatarStore((s) => s.setEmotion);

	// Load previous session from Gateway (SoT)
	useEffect(() => {
		if (sessionLoaded.current) return;
		sessionLoaded.current = true;

		const loadSession = async () => {
			const store = useChatStore.getState();
			store.setSessionId("agent:main:main");

			const config = loadConfig();
			if (!config?.discordSessionMigrated) {
				// One-time migration: restart Gateway to pick up session.dmScope,
				// then reset the contaminated main session (Discord DMs mixed in).
				await restartGateway();
				await resetGatewaySession("agent:main:main");
				if (config) {
					saveConfig({ ...config, discordSessionMigrated: true });
				}
				Logger.info(
					"ChatPanel",
					"One-time reset: cleared Discord-contaminated main session",
				);
			} else {
				const messages = await getGatewayHistory("agent:main:main");
				if (messages.length > 0) {
					store.setMessages(messages);
					Logger.info("ChatPanel", "Session loaded from Gateway", {
						messageCount: messages.length,
					});
				}
			}
		};

		loadSession().catch((err) => {
			Logger.warn("ChatPanel", "Failed to load session", {
				error: String(err),
			});
		});

		// Auto-discover Discord DM channel ID from Gateway sessions
		// (skip on migration run — no new sessions exist yet)
		if (loadConfig()?.discordSessionMigrated) {
			discoverAndPersistDiscordDmChannel().catch(() => {});
		}

		// Startup sync: ensure SOUL.md has latest facts for OpenClaw channels
		const cfg = loadConfig();
		if (cfg) {
			syncToOpenClaw(cfg.provider, cfg.model, cfg.apiKey).catch(() => {});
		}

		// Start periodic reverse sync: OpenClaw memory → Shell facts
		startMemorySync();
	}, []);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
	}, [messages, streamingContent]);

	function handleCancelStreaming() {
		const store = useChatStore.getState();
		if (!store.isStreaming) return;
		const reqId = currentRequestId.current;
		if (reqId) {
			cancelChat(reqId).catch((err) => {
				Logger.warn("ChatPanel", "Failed to cancel stream", {
					error: String(err),
				});
			});
		}
		store.finishStreaming();
		setEmotion("neutral");
		currentRequestId.current = null;
	}

	// ESC key to cancel streaming
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && useChatStore.getState().isStreaming) {
				handleCancelStreaming();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	// Discord messages are now shown in the dedicated Channels tab (ChannelsTab)
	// via direct Discord REST API, so no polling into main chat.

	// Auto-send queued messages when streaming ends
	useEffect(() => {
		if (!isStreaming && messageQueue.length > 0) {
			const next = useChatStore.getState().dequeueMessage();
			if (next) {
				setInput(next);
				// Send on next tick after state update
				setTimeout(() => handleSend(), 50);
			}
		}
	}, [isStreaming, messageQueue.length]);

	async function handleNewConversation() {
		const store = useChatStore.getState();
		const prevMessages = store.messages;
		store.newConversation();

		// Summarize previous session in background + extract facts
		if (prevMessages.length >= 2) {
			const config = loadConfig();
			if (config?.apiKey) {
				summarizePreviousSession(
					prevMessages,
					config.apiKey,
					config.provider || "gemini",
				);
			}
		}

		// Reset Gateway session and set local session ID
		try {
			await resetGatewaySession();
			useChatStore.getState().setSessionId("agent:main:main");
			Logger.info("ChatPanel", "New conversation started via Gateway");
		} catch (err) {
			Logger.warn("ChatPanel", "Failed to reset Gateway session", {
				error: String(err),
			});
		}
	}

	async function handleSend(overrideText?: string) {
		const text = (overrideText ?? input).trim();
		if (!text) return;

		// Omni voice mode: send text via Live session
		if (
			voiceMode === "active" &&
			!pipelineActiveRef.current &&
			voiceSessionRef.current?.isConnected
		) {
			setInput("");
			voiceSessionRef.current.sendText(text);
			return;
		}
		// Pipeline voice mode: send via normal chat path (TTS handled by handleChunk)
		// Falls through to the normal sendChatMessage flow below

		// If streaming, queue the message instead
		if (isStreaming) {
			useChatStore.getState().enqueueMessage(text);
			setInput("");
			return;
		}

		setInput("");
		useChatStore.getState().addMessage({ role: "user", content: text });

		useChatStore.getState().startStreaming();
		// Reset TTS sequence for new response ordering
		audioQueueRef.current?.resetSeq();

		const requestId = generateRequestId();
		currentRequestId.current = requestId;
		const store = useChatStore.getState();

		const config = await loadConfigWithSecrets();
		if (config?.provider === "nextain" && !config?.naiaKey) {
			useChatStore
				.getState()
				.appendStreamChunk(
					"Naia 계정 로그인이 필요합니다. 설정에서 로그인해주세요.",
				);
			useChatStore.getState().finishStreaming();
			return;
		}
		if (
			!isApiKeyOptional(config?.provider ?? "") &&
			!config?.apiKey &&
			!config?.naiaKey
		) {
			useChatStore.getState().appendStreamChunk(t("chat.noApiKey"));
			useChatStore.getState().finishStreaming();
			return;
		}
		if (!config) return;

		const history = store.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({ role: m.role, content: m.content }));

		// TTS is handled by Shell via SentenceChunker (both chat and pipeline mode).
		// Agent auto-TTS disabled — Shell controls TTS directly via requestTts IPC.
		const chatTtsEnabled =
			!pipelineActiveRef.current && config.ttsEnabled === true;
		const activeProvider = config.provider || provider;

		// Initialize/update SentenceChunker + AudioQueue for chat TTS
		if (chatTtsEnabled) {
			if (!audioQueueRef.current) {
				audioQueueRef.current = new AudioQueue({
					onPlaybackStart: () => {
						useAvatarStore.getState().setSpeaking(true);
						ttsPlayingRef.current = true;
						setTtsPlaying(true);
					},
					onPlaybackEnd: () => {
						useAvatarStore.getState().setSpeaking(false);
						ttsPlayingRef.current = false;
						setTtsPlaying(false);
					},
				});
			}
			sentenceChunkerRef.current = new SentenceChunker();
			// Always refresh voice config from latest settings
			pipelineVoiceConfigRef.current = {
				voice:
					config.ttsProvider === "nextain"
						? `ko-KR-Chirp3-HD-${config.voice ?? getDefaultVoiceForAvatar(config.vrmModel)}`
						: config.ttsVoice,
				ttsProvider: config.ttsProvider || "edge",
				ttsApiKey:
					config.ttsProvider === "google"
						? config.googleApiKey || config.apiKey
						: config.ttsProvider === "openai"
							? config.openaiTtsApiKey
							: config.ttsProvider === "elevenlabs"
								? config.elevenlabsApiKey
								: undefined,
				naiaKey: config.naiaKey,
			};
		}

		const memoryCtx = await buildMemoryContext();
		Logger.info("ChatPanel", "handleSend → sendChatMessage", {
			pipelineActive: pipelineActiveRef.current,
			chatTtsEnabled,
			hasChunker: !!sentenceChunkerRef.current,
			requestId,
			textPreview: text.slice(0, 40),
		});
		// Guard against provider/model mismatch (e.g. provider=gemini, model=claude-sonnet-4-6).
		// When the saved model is not valid for the active provider, fall back to the default.
		// Skip validation for providers with dynamic models (e.g. Ollama — empty static model list).
		const savedModel =
			config.model || getDefaultLlmModel(activeProvider) || "gemini-2.5-flash";
		const providerMeta = getLlmProvider(activeProvider);
		const hasDynamicModels = providerMeta && providerMeta.models.length === 0;
		const modelIsValid =
			!providerMeta ||
			hasDynamicModels ||
			providerMeta.models.some((m) => m.id === savedModel);
		const resolvedModel =
			(modelIsValid ? savedModel : getDefaultLlmModel(activeProvider)) ||
			"gemini-2.5-flash";
		if (!modelIsValid) {
			Logger.warn("ChatPanel", "Model not valid for provider — using default", {
				provider: activeProvider,
				savedModel,
				resolvedModel,
			});
		}

		try {
			await sendChatMessage({
				message: text,
				provider: {
					provider: activeProvider,
					model: resolvedModel,
					apiKey: config.apiKey,
					naiaKey: activeProvider === "nextain" ? config.naiaKey : undefined,
					ollamaHost:
						activeProvider === "ollama" ? config.ollamaHost : undefined,
				},
				naiaKey: config.naiaKey || undefined,
				history: history.slice(0, -1),
				onChunk: (chunk) => handleChunk(chunk, activeProvider),
				requestId,
				// TTS handled by Shell — don't send TTS params to agent
				systemPrompt: pipelineActiveRef.current
					? `You are in a voice conversation. Keep responses brief and conversational (2-3 sentences max). Speak naturally as if talking to a friend.\n\n${buildSystemPrompt(config.persona, memoryCtx)}`
					: buildSystemPrompt(config.persona, memoryCtx),
				enableTools: pipelineActiveRef.current ? false : config.enableTools,
				gatewayUrl:
					!pipelineActiveRef.current && config.enableTools
						? config.gatewayUrl || "ws://localhost:18789"
						: undefined,
				gatewayToken:
					!pipelineActiveRef.current && config.enableTools
						? config.gatewayToken
						: undefined,
				disabledSkills:
					!pipelineActiveRef.current && config.enableTools
						? [...(sanitizeDisabledSkills(config.disabledSkills) ?? [])]
						: undefined,
				routeViaGateway:
					!pipelineActiveRef.current &&
					config.enableTools &&
					(config.chatRouting ?? "auto") !== "direct"
						? true
						: undefined,
				slackWebhookUrl: config.slackWebhookUrl,
				discordWebhookUrl: config.discordWebhookUrl,
				googleChatWebhookUrl: config.googleChatWebhookUrl,
				discordDefaultUserId: config.discordDefaultUserId,
				discordDefaultTarget: config.discordDefaultTarget,
				discordDmChannelId: config.discordDmChannelId,
			});
		} catch (err) {
			useChatStore
				.getState()
				.appendStreamChunk(`\n[${t("chat.error")}] ${String(err)}`);
			useChatStore.getState().finishStreaming();
		}
	}

	function handleChunk(chunk: AgentResponseChunk, activeProvider: ProviderId) {
		const store = useChatStore.getState();

		if (
			chunk.type === "text" ||
			chunk.type === "finish" ||
			chunk.type === "usage"
		) {
			Logger.info("ChatPanel", "handleChunk", {
				type: chunk.type,
				pipelineActive: pipelineActiveRef.current,
				hasChunker: !!sentenceChunkerRef.current,
				...(chunk.type === "text"
					? { textLen: chunk.text.length, textPreview: chunk.text.slice(0, 60) }
					: {}),
			});
		}

		switch (chunk.type) {
			case "text": {
				store.appendStreamChunk(chunk.text);
				// Parse emotion from accumulated text (tag may span multiple chunks)
				const accumulated = store.streamingContent;
				if (accumulated.length <= 30 && accumulated.length >= 4) {
					const { emotion } = parseEmotion(accumulated);
					setEmotion(emotion);
				}
				// Sentence-level TTS — same path for both pipeline and chat mode
				if (sentenceChunkerRef.current) {
					const sentences = sentenceChunkerRef.current.feed(chunk.text);
					if (sentences.length > 0) {
						Logger.info("ChatPanel", "SentenceChunker produced sentences", {
							count: sentences.length,
							sentences,
						});
					}
					for (const sentence of sentences) {
						sendSentenceToTts(sentence);
					}
				}
				break;
			}
			case "thinking":
				store.appendThinkingChunk(chunk.text);
				break;
			case "audio":
				// Agent auto-TTS disabled — Shell handles TTS via SentenceChunker.
				// This case handles legacy audio events if any.
				if (!sentenceChunkerRef.current) {
					playBase64Audio(chunk.data);
				}
				break;
			case "tool_use":
				store.addStreamingToolUse(chunk.toolCallId, chunk.toolName, chunk.args);
				break;
			case "tool_result":
				store.updateStreamingToolResult(
					chunk.toolCallId,
					chunk.success,
					chunk.output,
				);
				break;
			case "approval_request":
				if (isToolAllowed(chunk.toolName)) {
					sendApprovalResponse(chunk.requestId, chunk.toolCallId, "once");
				} else {
					store.setPendingApproval({
						requestId: chunk.requestId,
						toolCallId: chunk.toolCallId,
						toolName: chunk.toolName,
						args: chunk.args,
						tier: chunk.tier,
						description: chunk.description,
					});
				}
				break;
			case "usage": {
				store.finishStreaming();
				setEmotion("neutral");
				store.addCostEntry({
					inputTokens: chunk.inputTokens,
					outputTokens: chunk.outputTokens,
					cost: chunk.cost,
					provider: activeProvider,
					model: chunk.model,
				});
				// Auto-extract facts every 10 new messages
				const allMsgs = useChatStore.getState().messages;
				const unextracted = allMsgs.length - lastExtractedIdx.current;
				if (unextracted >= 10) {
					lastExtractedIdx.current = allMsgs.length;
					const config = loadConfig();
					if (config?.apiKey) {
						extractRecentFacts(
							allMsgs.slice(-unextracted),
							config.apiKey,
							config.provider || "gemini",
						);
					}
				}
				break;
			}
			case "finish":
				// Flush remaining text to TTS (both pipeline and chat mode)
				if (sentenceChunkerRef.current) {
					const remaining = sentenceChunkerRef.current.flush();
					if (remaining) {
						Logger.info("ChatPanel", "SentenceChunker flush on finish", {
							remaining: remaining.slice(0, 60),
						});
						sendSentenceToTts(remaining);
					}
					// Chat mode: clean up chunker after message complete (pipeline keeps it)
					if (!pipelineActiveRef.current) {
						sentenceChunkerRef.current = null;
					}
				}
				if (store.isStreaming) {
					store.finishStreaming();
					setEmotion("neutral");
				}
				break;
			case "config_update": {
				const cfg = loadConfig();
				if (cfg) {
					// Ignore built-in skill toggles from chat/tool output.
					if (BUILTIN_SKILLS.has(chunk.skillName)) {
						Logger.info(
							"ChatPanel",
							"Ignored config_update for built-in skill",
							{
								skillName: chunk.skillName,
								action: chunk.action,
							},
						);
						break;
					}
					const disabled = cfg.disabledSkills ?? [];
					if (chunk.action === "enable_skill") {
						cfg.disabledSkills = disabled.filter((n) => n !== chunk.skillName);
					} else if (chunk.action === "disable_skill") {
						if (!disabled.includes(chunk.skillName)) {
							cfg.disabledSkills = [...disabled, chunk.skillName];
						}
					}
					saveConfig(cfg);
					useSkillsStore.getState().bumpConfigVersion();
				}
				break;
			}
			case "gateway_approval_request":
				// Gateway-originated approval — treat like local approval
				store.setPendingApproval({
					requestId: chunk.requestId,
					toolCallId: chunk.toolCallId,
					toolName: chunk.toolName,
					args: chunk.args,
					tier: 2,
					description: `Gateway: ${chunk.toolName}`,
				});
				break;
			case "log_entry":
				useLogsStore.getState().addEntry({
					level: chunk.level,
					message: chunk.message,
					timestamp: chunk.timestamp,
				});
				break;
			case "discord_message":
				// Discord DM messages are shown in the dedicated Channels tab.
				// Ignore them here to keep the main chat clean.
				break;
			case "error":
				Logger.warn("ChatPanel", "Agent error chunk", {
					message: chunk.message,
				});
				// Pipeline voice: flush remaining text to TTS before finishing
				if (pipelineActiveRef.current && sentenceChunkerRef.current) {
					const remaining = sentenceChunkerRef.current.flush();
					if (remaining) {
						Logger.info("ChatPanel", "Pipeline voice flush on error", {
							remainingLen: remaining.length,
						});
						sendSentenceToTts(remaining);
					}
				}
				store.appendStreamChunk(`\n[${t("chat.error")}] ${chunk.message}`);
				store.finishStreaming();
				setEmotion("neutral");
				break;
		}
	}

	function handleApprovalDecision(decision: "once" | "always" | "reject") {
		const approval = useChatStore.getState().pendingApproval;
		if (!approval) return;

		if (decision === "always") {
			addAllowedTool(approval.toolName);
		}

		sendApprovalResponse(approval.requestId, approval.toolCallId, decision);
		useChatStore.getState().clearPendingApproval();
	}

	// Cleanup voice session on unmount
	useEffect(() => {
		return () => {
			voiceSessionRef.current?.disconnect();
			micStreamRef.current?.stop();
			audioPlayerRef.current?.destroy();
		};
	}, []);

	// Extract facts when app goes to background or closes
	useEffect(() => {
		function onVisibilityChange() {
			if (document.visibilityState !== "hidden") return;
			const allMsgs = useChatStore.getState().messages;
			const unextracted = allMsgs.length - lastExtractedIdx.current;
			if (unextracted < 3) return;
			lastExtractedIdx.current = allMsgs.length;
			const config = loadConfig();
			if (config?.apiKey) {
				extractRecentFacts(
					allMsgs.slice(-unextracted),
					config.apiKey,
					config.provider || "gemini",
				);
			}
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);

	function showVoiceCostSummary() {
		const info = voiceStartRef.current;
		if (!info) return;
		voiceStartRef.current = null;
		const elapsed = (Date.now() - info.time) / 1000;
		if (elapsed < 3) return; // ignore very short sessions
		const minutes = elapsed / 60;
		const hint =
			LIVE_PROVIDER_COST_HINTS[
				info.provider as keyof typeof LIVE_PROVIDER_COST_HINTS
			];
		if (!hint || hint.cost === "Free") return;
		const match = hint.cost.match(/\$([\d.]+)/);
		if (!match) return;
		const rate = Number.parseFloat(match[1]);
		const totalCost = rate * minutes;
		const durationStr =
			minutes < 1
				? `${Math.round(elapsed)}s`
				: `${Math.floor(minutes)}m ${Math.round(elapsed % 60)}s`;
		// Estimate tokens: Gemini=32tok/s, OpenAI input=10tok/s output=20tok/s
		const isOpenAI = info.provider === "openai-realtime";
		const inputTokens = Math.round(elapsed * (isOpenAI ? 10 : 32));
		const outputTokens = Math.round(elapsed * (isOpenAI ? 20 : 32));
		// Map provider to ProviderId-compatible string
		const providerMap: Record<string, string> = {
			naia: "nextain",
			"gemini-live": "gemini",
			"openai-realtime": "openai",
		};
		useChatStore.getState().addMessage({
			role: "assistant",
			content: `🎙️ ${durationStr} · ~$${totalCost.toFixed(3)} (${hint.note})`,
			cost: {
				provider: (providerMap[info.provider] ?? info.provider) as any,
				model: isOpenAI ? "gpt-realtime" : "gemini-live",
				inputTokens,
				outputTokens,
				cost: totalCost,
			},
		});
	}

	/** Send a sentence to TTS via Agent and enqueue the resulting audio. */
	function sendSentenceToTts(sentence: string): void {
		// Strip emotion tags and emoji before TTS
		const clean = sentence
			.replace(/\[(?:HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/gi, "")
			.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
			.trim();
		if (!clean) return;

		const reqId = generateRequestId();
		// Reserve sequence number BEFORE async request to guarantee order
		const seq = audioQueueRef.current?.reserveSeq() ?? 0;
		activeTtsRequestsRef.current.add(reqId);
		const voiceCfg = pipelineVoiceConfigRef.current;
		Logger.info("ChatPanel", "Sending TTS request", {
			reqId,
			seq,
			sentence: clean.slice(0, 50),
			provider: voiceCfg?.ttsProvider,
		});
		const ttsProviderForCost = voiceCfg?.ttsProvider ?? "edge";
		const ttsVoiceForCost = voiceCfg?.voice;
		requestTts({
			text: clean,
			voice: voiceCfg?.voice,
			ttsProvider: voiceCfg?.ttsProvider as
				| "edge"
				| "google"
				| "openai"
				| "elevenlabs"
				| "nextain"
				| undefined,
			ttsApiKey: voiceCfg?.ttsApiKey,
			naiaKey: voiceCfg?.naiaKey,
			requestId: reqId,
			onAudio: (mp3Base64, costUsd) => {
				Logger.info("ChatPanel", "TTS audio received", {
					reqId,
					seq,
					size: mp3Base64.length,
					costUsd,
				});
				audioQueueRef.current?.enqueueOrdered(seq, mp3Base64);
				activeTtsRequestsRef.current.delete(reqId);
				// Track TTS cost: use server cost for Naia Cloud, estimate for others
				const ttsCost =
					costUsd != null
						? costUsd
						: estimateTtsCost(
								ttsProviderForCost,
								clean.length,
								ttsVoiceForCost,
							);
				if (ttsCost > 0) {
					useChatStore.getState().addCostEntry({
						inputTokens: 0,
						outputTokens: 0,
						cost: ttsCost,
						provider: ttsProviderForCost as ProviderId,
						model: `tts:${ttsProviderForCost}`,
					});
				}
			},
		});
	}

	/** Clean up pipeline voice resources. */
	function cleanupPipeline(): void {
		pipelineActiveRef.current = false;
		audioQueueRef.current?.destroy();
		audioQueueRef.current = null;
		sentenceChunkerRef.current?.clear();
		sentenceChunkerRef.current = null;
		pipelineVoiceConfigRef.current = null;
		activeTtsRequestsRef.current.clear();
		// Stop Vosk STT
		for (const fn of sttCleanupRef.current) fn();
		sttCleanupRef.current = [];
		if (sttDebounceRef.current) {
			clearTimeout(sttDebounceRef.current);
			sttDebounceRef.current = null;
		}
		sttBufferRef.current = "";
		setSttPartial("");
		setSttState("idle");
		sttStop().catch(() => {});
	}

	async function handleVoiceToggle() {
		// Barge-in: if TTS is playing, stop TTS + cancel stream, stay in voice mode
		if (voiceMode === "active" && ttsPlayingRef.current) {
			Logger.info("ChatPanel", "Barge-in via button: stopping TTS");
			audioQueueRef.current?.clear();
			ttsPlayingRef.current = false;
			setTtsPlaying(false);
			handleCancelStreaming();
			sentenceChunkerRef.current?.clear();
			ttsCooldownUntilRef.current = Date.now() + 300;
			return;
		}

		if (voiceMode !== "off") {
			// Stop voice session — show cost summary before cleanup
			if (pipelineActiveRef.current) {
				cleanupPipeline();
			} else {
				showVoiceCostSummary();
				voiceSessionRef.current?.disconnect();
				micStreamRef.current?.stop();
				audioPlayerRef.current?.destroy();
				voiceSessionRef.current = null;
				micStreamRef.current = null;
				audioPlayerRef.current = null;
			}
			setVoiceMode("off");
			return;
		}

		setVoiceMode("connecting");

		try {
			const config = await loadConfigWithSecrets();
			if (!config) {
				setVoiceMode("off");
				return;
			}
			const naiaKey = config?.naiaKey;
			const modelMeta = getLlmModel(config.provider, config.model);
			const isOmni = modelMeta?.type === "omni";

			// LLM models use pipeline voice (Vosk STT → LLM → sentence TTS)
			if (!isOmni) {
				// Guard: STT provider must be configured; model required only for offline engines
				const sttProviderMeta = getSttProvider(config.sttProvider || "");
				const needsModel = sttProviderMeta?.engineType === "tauri";
				if (!config.sttProvider || (needsModel && !config.sttModel)) {
					setVoiceMode("off");
					if (
						globalThis.confirm(
							`${t("voice.setupRequired")}\n\n${t("voice.goToSettings")}?`,
						)
					) {
						setActiveTab("settings");
					}
					return;
				}

				const queue = new AudioQueue({
					onPlaybackStart: () => {
						useAvatarStore.getState().setSpeaking(true);
						ttsPlayingRef.current = true;
						setTtsPlaying(true);
					},
					onPlaybackEnd: () => {
						useAvatarStore.getState().setSpeaking(false);
						ttsPlayingRef.current = false;
						setTtsPlaying(false);
						// Cooldown: suppress STT for 1.5s after TTS ends
						// to prevent mic echo from final TTS audio
						ttsCooldownUntilRef.current = Date.now() + 800;
						// Brief "waiting" state during cooldown, then back to listening
						setSttState("initializing");
						setTimeout(() => setSttState("listening"), 800);
					},
				});
				audioQueueRef.current = queue;
				sentenceChunkerRef.current = new SentenceChunker();
				pipelineActiveRef.current = true;
				pipelineVoiceConfigRef.current = {
					voice: config.ttsVoice || config.voice,
					ttsProvider: config.ttsProvider || "edge",
					ttsApiKey:
						config.ttsProvider === "google"
							? config.googleApiKey || config.apiKey
							: config.ttsProvider === "openai"
								? config.openaiTtsApiKey
								: config.ttsProvider === "elevenlabs"
									? config.elevenlabsApiKey
									: undefined,
					naiaKey: config.naiaKey,
				};

				// Start STT engine — route to Tauri plugin (offline) or API-based
				setSttState("initializing");
				try {
					const sttLang = localeToSttLanguage(getLocale());
					const sttEngine = config.sttProvider || "vosk";
					const sttMeta = getSttProvider(sttEngine);
					const isApiBased = sttMeta?.engineType === "api";

					// Shared result handler for both offline and API-based STT
					const handleSttResult = (result: {
						transcript: string;
						isFinal: boolean;
						confidence?: number;
					}) => {
						// Filter Whisper hallucinations: (sound descriptions), [noise], etc.
						const filtered = result.transcript
							.replace(/\([^)]*\)/g, "")
							.replace(/\[[^\]]*\]/g, "")
							.trim();
						if (!filtered) return;
						const cleanResult = { ...result, transcript: filtered };
						Logger.info("ChatPanel", "STT result", {
							transcript: cleanResult.transcript,
							isFinal: cleanResult.isFinal,
							confidence: cleanResult.confidence,
						});
						if (!pipelineActiveRef.current) return;

						if (
							ttsPlayingRef.current ||
							Date.now() < ttsCooldownUntilRef.current
						) {
							Logger.info(
								"ChatPanel",
								"STT result suppressed (TTS playing/cooldown)",
							);
							return;
						}

						if (!cleanResult.isFinal) {
							setSttPartial(cleanResult.transcript);
						}

						if (cleanResult.isFinal && cleanResult.transcript.trim()) {
							setSttPartial("");
							sttBufferRef.current +=
								(sttBufferRef.current ? " " : "") +
								cleanResult.transcript.trim();
							if (sttDebounceRef.current) clearTimeout(sttDebounceRef.current);
							sttDebounceRef.current = setTimeout(() => {
								const text = sttBufferRef.current.trim();
								sttBufferRef.current = "";
								if (text && pipelineActiveRef.current) {
									if (useChatStore.getState().isStreaming) {
										Logger.info(
											"ChatPanel",
											"Skipping duplicate send (already streaming)",
											{ text },
										);
										return;
									}
									handleSend(text);
								}
							}, 300);
						}
					};

					if (isApiBased) {
						// API-based STT — browser MediaStream + cloud API
						const apiKey = sttMeta?.requiresNaiaKey
							? config.naiaKey
							: sttMeta?.apiKeyConfigField === "googleApiKey"
								? config.googleApiKey
								: sttMeta?.apiKeyConfigField === "elevenlabsApiKey"
									? config.elevenlabsApiKey
									: "";
						if (!apiKey) {
							Logger.warn("ChatPanel", "API STT requires API key", {
								provider: sttEngine,
							});
							setSttState("idle");
							return;
						}
						const session = createApiSttSession({
							provider: sttEngine as "google" | "elevenlabs" | "nextain",
							apiKey,
							language: sttLang,
						});
						const cleanupResult = session.onResult(handleSttResult);
						sttCleanupRef.current.push(cleanupResult);
						if (session.onError) {
							const cleanupError = session.onError((err) => {
								Logger.warn("ChatPanel", "API STT error", {
									code: err.code,
									message: err.message,
								});
							});
							sttCleanupRef.current.push(cleanupError);
						}
						// Track STT cost per API call — shown in CostDashboard breakdown
						if (session.onCost) {
							const cleanupCost = session.onCost(
								(cost: { durationSeconds: number }) => {
									const sttCost = estimateSttCost(
										sttEngine,
										cost.durationSeconds,
									);
									if (sttCost > 0) {
										useChatStore.getState().addSessionCostEntry({
											inputTokens: 0,
											outputTokens: 0,
											cost: sttCost,
											provider: sttEngine,
											model: `stt:${sttEngine}`,
										});
									}
								},
							);
							sttCleanupRef.current.push(cleanupCost);
						}
						sttCleanupRef.current.push(() => session.stop());
						await session.start();
						setSttState("listening");
					} else {
						// Tauri plugin (offline: Vosk/Whisper)
						const unlistenResult = await sttOnResult(
							(result: RecognitionResult) => {
								handleSttResult(result);
							},
						);
						const resultCleanup =
							typeof unlistenResult === "function"
								? unlistenResult
								: () => unlistenResult.unregister();
						sttCleanupRef.current.push(resultCleanup);

						const unlistenState = await sttOnStateChange((event) => {
							Logger.info("ChatPanel", "STT state change", {
								state: event.state,
							});
							if (event.state === "listening") setSttState("listening");
						});
						const stateCleanup =
							typeof unlistenState === "function"
								? unlistenState
								: () => unlistenState.unregister();
						sttCleanupRef.current.push(stateCleanup);

						const unlistenError = await sttOnError((err) => {
							Logger.warn("ChatPanel", "STT error", {
								code: err.code,
								message: err.message,
							});
						});
						const errorCleanup =
							typeof unlistenError === "function"
								? unlistenError
								: () => unlistenError.unregister();
						sttCleanupRef.current.push(errorCleanup);

						Logger.info("ChatPanel", "Starting STT", {
							engine: sttEngine,
							model: config.sttModel,
							language: sttLang,
						});
						await sttStart({
							engine: sttEngine,
							modelId: config.sttModel,
							language: sttLang,
							continuous: true,
							interimResults: true,
						} as Record<string, unknown> & Parameters<typeof sttStart>[0]);
					}
					Logger.info("ChatPanel", "STT started successfully", {
						engine: sttEngine,
						apiMode: isApiBased,
					});
				} catch (sttErr) {
					Logger.warn(
						"ChatPanel",
						"STT start failed — falling back to text input",
						{ error: String(sttErr) },
					);
					setSttState("idle");
				}

				Logger.info("ChatPanel", "Pipeline voice mode started", {
					provider: config.provider,
					model: config.model,
					ttsProvider: config.ttsProvider || "edge",
				});

				setVoiceMode("active");
				// Voice mode notification — not sent to agent, not read by TTS
				Logger.info("ChatPanel", "Voice mode started notification displayed");
				return;
			}

			// Determine the live provider from the current model/provider
			const liveProvider =
				config.provider === "openai"
					? ("openai-realtime" as const)
					: naiaKey
						? ("naia" as const)
						: ("gemini-live" as const);

			Logger.info("ChatPanel", "Voice config", {
				provider: config.provider,
				model: config.model,
				liveProvider,
				hasNaiaKey: !!naiaKey,
				hasGoogleApiKey: !!config.googleApiKey,
				hasOpenaiKey: !!(config.openaiRealtimeApiKey ?? config.apiKey),
			});

			// Validate credentials per provider
			if (liveProvider === "naia" && !naiaKey) {
				Logger.warn("ChatPanel", "Naia OS voice requires Naia key");
				useChatStore.getState().addMessage({
					role: "assistant",
					content: t("chat.voiceNeedLabKey"),
				});
				setVoiceMode("off");
				return;
			}
			if (liveProvider === "gemini-live" && !naiaKey && !config.googleApiKey) {
				Logger.warn("ChatPanel", "Gemini Live requires Google API key");
				useChatStore.getState().addMessage({
					role: "assistant",
					content: "Gemini Live를 사용하려면 Google API Key를 입력하세요.",
				});
				setVoiceMode("off");
				return;
			}
			if (liveProvider === "openai-realtime") {
				const openaiKey = config.openaiRealtimeApiKey ?? config.apiKey;
				if (!openaiKey) {
					Logger.warn("ChatPanel", "OpenAI Realtime requires API key");
					useChatStore.getState().addMessage({
						role: "assistant",
						content: "OpenAI Realtime을 사용하려면 API Key를 입력하세요.",
					});
					setVoiceMode("off");
					return;
				}
			}

			const memoryCtx = await buildMemoryContext();
			const systemPrompt = buildSystemPrompt(config.persona, memoryCtx);

			// Create voice session via provider factory
			// Gemini Direct uses Rust proxy (WebKitGTK can't connect to Google's WS)
			const useDirectMode =
				liveProvider === "gemini-live" && !!config.googleApiKey;
			const session = createVoiceSession(liveProvider, {
				useProxy: useDirectMode,
			});
			voiceSessionRef.current = session;

			// Create audio player
			const player = createAudioPlayer({
				sampleRate: 24000,
				onPlaybackStart: () => useAvatarStore.getState().setSpeaking(true),
				onPlaybackEnd: () => useAvatarStore.getState().setSpeaking(false),
			});
			audioPlayerRef.current = player;

			// Wire session events — accumulate incremental transcript chunks
			let inputTurnDirty = false;
			let outputTurnDirty = false;
			let inputAccum = "";
			let outputAccum = "";

			session.onAudio = (pcmBase64) => player.enqueue(pcmBase64);
			session.onInputTranscript = (text) => {
				const store = useChatStore.getState();
				inputAccum += text;
				if (inputTurnDirty) {
					store.updateLastMessage("user", inputAccum);
				} else {
					store.addMessage({ role: "user", content: text });
					inputTurnDirty = true;
				}
			};
			session.onOutputTranscript = (text) => {
				const store = useChatStore.getState();
				outputAccum += text;
				if (outputTurnDirty) {
					store.updateLastMessage("assistant", outputAccum);
				} else {
					store.addMessage({ role: "assistant", content: text });
					outputTurnDirty = true;
				}
			};
			session.onInterrupted = () => {
				player.clear();
				inputTurnDirty = false;
				outputTurnDirty = false;
				inputAccum = "";
				outputAccum = "";
			};
			session.onTurnEnd = () => {
				inputTurnDirty = false;
				outputTurnDirty = false;
				inputAccum = "";
				outputAccum = "";
			};
			session.onToolCall = async (callId, toolName, args) => {
				try {
					const result = await directToolCall({
						toolName,
						args,
						requestId: generateRequestId(),
						gatewayUrl: resolveGatewayUrl(config),
						gatewayToken: config.gatewayToken,
					});
					session.sendToolResponse(callId, result.output);
				} catch (err) {
					session.sendToolResponse(callId, `Error: ${err}`);
				}
			};
			session.onError = (err) => {
				Logger.warn("ChatPanel", "Voice session error", { error: err.message });
				useChatStore.getState().addMessage({
					role: "assistant",
					content: `${t("chat.voiceError")}: ${err.message}`,
				});
				setVoiceMode("off");
			};
			session.onDisconnect = () => {
				showVoiceCostSummary();
				micStreamRef.current?.stop();
				audioPlayerRef.current?.destroy();
				micStreamRef.current = null;
				audioPlayerRef.current = null;
				setVoiceMode("off");
			};

			// Build provider-specific config and connect
			const selectedVoice =
				config.voice ?? getDefaultVoiceForAvatar(config.vrmModel);
			if (liveProvider === "openai-realtime") {
				const openaiKey = config.openaiRealtimeApiKey ?? config.apiKey;
				await session.connect({
					provider: "openai-realtime",
					apiKey: openaiKey!,
					voice: selectedVoice,
					locale: getLocale(),
					systemInstruction: systemPrompt,
				});
			} else {
				// Gemini Live: naia (gateway) or gemini-live (direct via Rust proxy)
				await session.connect({
					provider: "gemini-live",
					gatewayUrl: useDirectMode ? undefined : LAB_GATEWAY_URL,
					naiaKey: useDirectMode ? undefined : naiaKey,
					googleApiKey: useDirectMode ? config.googleApiKey : undefined,
					voice: selectedVoice,
					locale: getLocale(),
					systemInstruction: systemPrompt,
				});
			}

			// Create mic stream
			const mic = await createMicStream({
				onChunk: (pcmBase64) => {
					// Mute mic while Naia is speaking to prevent echo feedback (Issue #22).
					// WebKitGTK (Tauri) does not support browser-level AEC effectively,
					// so we suppress mic input during playback at the application level.
					if (!audioPlayerRef.current?.isPlaying) {
						session.sendAudio(pcmBase64);
					}
				},
				sampleRate: 16000,
			});
			micStreamRef.current = mic;
			mic.start();

			setVoiceMode("active");
			voiceStartRef.current = { time: Date.now(), provider: liveProvider };
			Logger.info("ChatPanel", "Voice conversation started", {
				provider: liveProvider,
			});
		} catch (err) {
			Logger.warn("ChatPanel", "Voice connection failed", {
				error: String(err),
			});
			useChatStore.getState().addMessage({
				role: "assistant",
				content: `${t("chat.voiceError")}: ${err}`,
			});
			// Detach onDisconnect before cleanup to prevent double-cleanup
			if (voiceSessionRef.current) voiceSessionRef.current.onDisconnect = null;
			voiceSessionRef.current?.disconnect();
			micStreamRef.current?.stop();
			audioPlayerRef.current?.destroy();
			voiceSessionRef.current = null;
			micStreamRef.current = null;
			audioPlayerRef.current = null;
			setVoiceMode("off");
		}
	}

	function handleTabChange(tab: TabId) {
		setActiveTab(tab);
		if (tab === "progress") {
			const store = useProgressStore.getState();
			store.setLoading(true);
			const filter: AuditFilter = { limit: 100 };
			Promise.all([
				invoke("get_audit_log", { filter }),
				invoke("get_audit_stats"),
			])
				.then(([eventsResult, statsResult]) => {
					const s = useProgressStore.getState();
					s.setEvents(eventsResult as AuditEvent[]);
					s.setStats(statsResult as Parameters<typeof s.setStats>[0]);
				})
				.catch((err) => {
					Logger.warn("ChatPanel", "Failed to load progress data", {
						error: String(err),
					});
				})
				.finally(() => {
					useProgressStore.getState().setLoading(false);
				});
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="chat-panel">
			{/* Header with tabs */}
			<div className="chat-header">
				<div className="chat-tabs">
					<button
						type="button"
						className={`chat-tab${activeTab === "chat" ? " active" : ""}`}
						onClick={() => handleTabChange("chat")}
						title={t("progress.tabChat")}
						aria-label={t("progress.tabChat")}
						data-tooltip={t("progress.tabChat")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.chat}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "history" ? " active" : ""}`}
						onClick={() => handleTabChange("history")}
						title={t("history.tabHistory")}
						aria-label={t("history.tabHistory")}
						data-tooltip={t("history.tabHistory")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.history}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "progress" ? " active" : ""}`}
						onClick={() => handleTabChange("progress")}
						title={t("progress.tabProgress")}
						aria-label={t("progress.tabProgress")}
						data-tooltip={t("progress.tabProgress")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.progress}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "skills" ? " active" : ""}`}
						onClick={() => handleTabChange("skills")}
						title={t("skills.tabSkills")}
						aria-label={t("skills.tabSkills")}
						data-tooltip={t("skills.tabSkills")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.skills}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "channels" ? " active" : ""}`}
						onClick={() => handleTabChange("channels")}
						title={t("channels.tabChannels")}
						aria-label={t("channels.tabChannels")}
						data-tooltip={t("channels.tabChannels")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.channels}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "agents" ? " active" : ""}`}
						onClick={() => handleTabChange("agents")}
						title={t("agents.tabAgents")}
						aria-label={t("agents.tabAgents")}
						data-tooltip={t("agents.tabAgents")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.agents}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "diagnostics" ? " active" : ""}`}
						onClick={() => handleTabChange("diagnostics")}
						title={t("diagnostics.tabDiagnostics")}
						aria-label={t("diagnostics.tabDiagnostics")}
						data-tooltip={t("diagnostics.tabDiagnostics")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.diagnostics}
						</span>
					</button>
					<button
						type="button"
						className={`chat-tab${activeTab === "settings" ? " active" : ""}`}
						onClick={() => handleTabChange("settings")}
						title={t("settings.title")}
						aria-label={t("settings.title")}
						data-tooltip={t("settings.title")}
					>
						<span className="chat-tab-icon" aria-hidden="true">
							{TAB_ICONS.settings}
						</span>
					</button>
				</div>
				<div className="chat-header-right">
					{totalSessionCost > 0 && (
						<button
							type="button"
							className="cost-badge session-cost cost-badge-clickable"
							onClick={() => setShowCostDashboard((v) => !v)}
						>
							{formatCost(totalSessionCost)}
						</button>
					)}
					<button
						type="button"
						className="settings-icon-btn new-chat-btn"
						onClick={handleNewConversation}
						title={t("chat.newConversation")}
						disabled={isStreaming}
					>
						+
					</button>
				</div>
			</div>

			{/* Progress tab */}
			{activeTab === "progress" && <WorkProgressPanel />}

			{/* Skills tab */}
			{activeTab === "skills" && (
				<SkillsTab
					onAskAI={(message) => {
						setInput(message);
						setActiveTab("chat");
						setTimeout(() => {
							inputRef.current?.focus();
						}, 50);
					}}
				/>
			)}

			{/* Channels tab */}
			{activeTab === "channels" && (
				<ChannelsTab
					onAskAI={(message) => {
						setInput(message);
						setActiveTab("chat");
						setTimeout(() => {
							inputRef.current?.focus();
						}, 50);
					}}
				/>
			)}

			{/* Agents tab */}
			{activeTab === "agents" && <AgentsTab />}

			{/* Diagnostics tab */}
			{activeTab === "diagnostics" && <DiagnosticsTab />}

			{/* Settings tab */}
			{activeTab === "settings" && <SettingsTab />}

			{/* History tab */}
			{activeTab === "history" && (
				<HistoryTab
					onLoadSession={() => setActiveTab("chat")}
					onLoadDiscordSession={() => setActiveTab("channels")}
				/>
			)}

			{/* Cost dashboard (dropdown) */}
			{showCostDashboard && activeTab === "chat" && (
				<CostDashboard messages={messages} sessionCostEntries={sessionCostEntries} />
			)}

			{/* Messages (chat tab) */}
			<div
				className="chat-messages"
				style={{ display: activeTab === "chat" ? "flex" : "none" }}
			>
				{messages.map((msg) => (
					<div key={msg.id} className={`chat-message ${msg.role}`}>
						{msg.thinking && (
							<details className="thinking-block">
								<summary>{t("chat.thinking") || "Thinking..."}</summary>
								<div className="thinking-content">{msg.thinking}</div>
							</details>
						)}
						{msg.toolCalls?.map((tc) => (
							<ToolActivity key={tc.toolCallId} tool={tc} />
						))}
						<div className="message-content">
							{msg.role === "assistant" ? (
								<Markdown>{parseEmotion(msg.content).cleanText}</Markdown>
							) : (
								msg.content
							)}
						</div>
						{msg.cost && (
							<span className="cost-badge">
								{formatCost(msg.cost.cost)} ·{" "}
								{msg.cost.inputTokens + msg.cost.outputTokens}{" "}
								{t("chat.tokens")}
							</span>
						)}
					</div>
				))}

				{/* Streaming content */}
				{isStreaming && (
					<div className="chat-message assistant streaming">
						{streamingThinking && (
							<details className="thinking-block" open>
								<summary>{t("chat.thinking") || "Thinking..."}</summary>
								<div className="thinking-content">{streamingThinking}</div>
							</details>
						)}
						{streamingToolCalls.map((tc) => (
							<ToolActivity key={tc.toolCallId} tool={tc} />
						))}
						<div className="message-content">
							{streamingContent ? (
								<Markdown>{parseEmotion(streamingContent).cleanText}</Markdown>
							) : null}
							<span className="cursor-blink">▌</span>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Permission Modal */}
			{pendingApproval && (
				<PermissionModal
					pending={pendingApproval}
					onDecision={handleApprovalDecision}
				/>
			)}

			{/* Input (chat tab only) */}
			<div
				className="chat-input-bar"
				style={{ display: activeTab === "chat" ? "flex" : "none" }}
			>
				<button
					type="button"
					className={`chat-voice-btn${voiceMode === "connecting" ? " connecting" : voiceMode === "active" ? " active" : ""}${sttPartial ? " hearing" : ""}${ttsPlaying ? " speaking" : ""}${sttState === "initializing" && !ttsPlaying ? " preparing" : ""}`}
					onClick={handleVoiceToggle}
					disabled={voiceMode === "connecting"}
					title={
						voiceMode === "off"
							? t("chat.voiceStart")
							: voiceMode === "connecting"
								? t("chat.voiceConnecting")
								: ttsPlaying
									? "끼어들기 (TTS 중단)"
									: t("chat.voiceEnd")
					}
				>
					<span className="voice-bar" />
					<span className="voice-bar" />
					<span className="voice-bar" />
					<span className="voice-bar" />
				</button>
				{pipelineActiveRef.current && sttPartial && (
					<div className="stt-partial">{sttPartial}</div>
				)}
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={
						pipelineActiveRef.current
							? ttsPlaying
								? "나이아가 말하는 중... (버튼을 눌러 끊기)"
								: sttState === "initializing"
									? "음성 인식 준비 중..."
									: sttState === "listening"
										? "듣고 있어요... (텍스트 입력도 가능)"
										: t("chat.placeholder")
							: t("chat.placeholder")
					}
					rows={1}
					disabled={voiceMode !== "off" && !pipelineActiveRef.current}
					className="chat-input"
				/>
				{messageQueue.length > 0 && (
					<span className="queue-badge">
						{messageQueue.length} {t("chat.queued")}
					</span>
				)}
				{isStreaming ? (
					<button
						type="button"
						onClick={handleCancelStreaming}
						className="chat-send-btn chat-cancel-btn"
						title="ESC"
					>
						■
					</button>
				) : (
					<button
						type="button"
						onClick={() => handleSend()}
						disabled={!input.trim()}
						className="chat-send-btn"
					>
						↑
					</button>
				)}
			</div>
		</div>
	);
}
