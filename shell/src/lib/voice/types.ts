/**
 * Unified Live Voice Conversation types.
 *
 * All native Live API providers (Gemini Live, OpenAI Realtime, etc.)
 * share the same VoiceSession interface. The only difference is the WebSocket
 * message format, which each provider implementation handles internally.
 *
 * mic-stream.ts and audio-player.ts are provider-agnostic and reused as-is.
 */

// ── Provider ID ──

export type LiveProviderId = "naia" | "gemini-live" | "openai-realtime" | "minicpm-o" | "edge-tts";

export const LIVE_PROVIDER_LABELS: Record<LiveProviderId, string> = {
	naia: "Naia OS",
	"gemini-live": "Gemini",
	"openai-realtime": "OpenAI",
	"minicpm-o": "MiniCPM-o (Local)",
	"edge-tts": "Edge (TTS 전용)",
};

// ── Provider Cost Hints (approximate per-minute voice conversation cost) ──

export const LIVE_PROVIDER_COST_HINTS: Record<LiveProviderId, { cost: string; note: string }> = {
	naia: { cost: "~$0.03/min", note: "Naia credits" },
	"gemini-live": { cost: "~$0.03/min", note: "Google API Key" },
	"openai-realtime": { cost: "~$0.10/min", note: "OpenAI API Key" },
	"minicpm-o": { cost: "Free*", note: "Local GPU / RunPod ~$0.22/hr" },
	"edge-tts": { cost: "Free", note: "TTS only" },
};

// ── Provider Voice Options ──

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

// ── Tool Declaration (shared across providers) ──

export interface ToolDeclaration {
	name: string;
	description: string;
	parameters?: Record<string, unknown>;
}

// ── Provider Config ──

interface LiveProviderConfigBase {
	voice?: string;
	model?: string;
	systemInstruction?: string;
	tools?: ToolDeclaration[];
}

export interface GeminiLiveConfig extends LiveProviderConfigBase {
	provider: "gemini-live";
	/** Gateway mode: relay via any-llm gateway */
	gatewayUrl?: string;
	naiaKey?: string;
	/** Direct mode: connect to Gemini API directly with user's own key */
	googleApiKey?: string;
}

export interface OpenAIRealtimeConfig extends LiveProviderConfigBase {
	provider: "openai-realtime";
	apiKey: string;
}

export interface MiniCpmOConfig extends LiveProviderConfigBase {
	provider: "minicpm-o";
	/** Bridge server WebSocket URL (e.g. ws://localhost:8765). Provider appends /ws. */
	serverUrl: string;
}

export type LiveProviderConfig =
	| GeminiLiveConfig
	| OpenAIRealtimeConfig
	| MiniCpmOConfig;

// ── Voice Session (provider-agnostic interface) ──

export interface VoiceSession {
	connect: (config: LiveProviderConfig) => Promise<void>;
	sendAudio: (pcmBase64: string) => void;
	sendText: (text: string) => void;
	sendToolResponse: (callId: string, result: unknown) => void;
	disconnect: () => void;
	readonly isConnected: boolean;

	// Events
	onAudio: ((pcmBase64: string) => void) | null;
	onInputTranscript: ((text: string) => void) | null;
	onOutputTranscript: ((text: string) => void) | null;
	onToolCall:
		| ((id: string, name: string, args: Record<string, unknown>) => void)
		| null;
	onTurnEnd: (() => void) | null;
	onInterrupted: (() => void) | null;
	onError: ((error: Error) => void) | null;
	onDisconnect: (() => void) | null;
}

// ── Factory signature ──

export type VoiceSessionFactory = (config: LiveProviderConfig) => VoiceSession;
