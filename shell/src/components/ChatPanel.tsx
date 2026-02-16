import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../lib/chat-service";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import { buildSystemPrompt } from "../lib/persona";
import { transcribeAudio } from "../lib/stt";
import type { AgentResponseChunk } from "../lib/types";
import { parseEmotion } from "../lib/vrm/expression";
import { useAvatarStore } from "../stores/avatar";
import { useChatStore } from "../stores/chat";

function generateRequestId(): string {
	return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCost(cost: number): string {
	if (cost < 0.001) return `$${cost.toFixed(6)}`;
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	return `$${cost.toFixed(3)}`;
}

interface ChatPanelProps {
	onOpenSettings?: () => void;
}

export function ChatPanel({ onOpenSettings }: ChatPanelProps) {
	const [input, setInput] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	const messages = useChatStore((s) => s.messages);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const streamingContent = useChatStore((s) => s.streamingContent);
	const totalSessionCost = useChatStore((s) => s.totalSessionCost);
	const provider = useChatStore((s) => s.provider);

	const setEmotion = useAvatarStore((s) => s.setEmotion);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
	}, [messages, streamingContent]);

	async function handleSend() {
		const text = input.trim();
		if (!text || isStreaming) return;

		setInput("");
		useChatStore.getState().addMessage({ role: "user", content: text });
		useChatStore.getState().startStreaming();

		const requestId = generateRequestId();
		const store = useChatStore.getState();

		// Load config from localStorage
		const configRaw = localStorage.getItem("cafelua-config");
		const config = configRaw ? JSON.parse(configRaw) : null;
		if (!config?.apiKey) {
			useChatStore.getState().appendStreamChunk(t("chat.noApiKey"));
			useChatStore.getState().finishStreaming();
			return;
		}

		const history = store.messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => ({ role: m.role, content: m.content }));

		try {
			await sendChatMessage({
				message: text,
				provider: {
					provider: config.provider || provider,
					model: config.model || "gemini-2.5-flash",
					apiKey: config.apiKey,
				},
				history: history.slice(0, -1), // exclude last (just added) user msg
				onChunk: handleChunk,
				requestId,
				ttsVoice: config.ttsVoice,
				ttsApiKey: config.googleApiKey,
				systemPrompt: buildSystemPrompt(config.persona),
			});
		} catch (err) {
			useChatStore
				.getState()
				.appendStreamChunk(`\n[${t("chat.error")}] ${String(err)}`);
			useChatStore.getState().finishStreaming();
		}
	}

	function handleChunk(chunk: AgentResponseChunk) {
		const store = useChatStore.getState();

		switch (chunk.type) {
			case "text": {
				store.appendStreamChunk(chunk.text);
				// Parse emotion from first text chunk
				if (store.streamingContent.length === chunk.text.length) {
					const { emotion } = parseEmotion(chunk.text);
					if (emotion !== "neutral") {
						setEmotion(emotion);
					}
				}
				break;
			}
			case "audio":
				useAvatarStore.getState().setPendingAudio(chunk.data);
				break;
			case "usage":
				store.finishStreaming();
				store.addCostEntry({
					inputTokens: chunk.inputTokens,
					outputTokens: chunk.outputTokens,
					cost: chunk.cost,
					provider: provider,
					model: chunk.model,
				});
				break;
			case "finish":
				if (store.isStreaming) {
					store.finishStreaming();
				}
				break;
			case "error":
				store.appendStreamChunk(`\n[${t("chat.error")}] ${chunk.message}`);
				store.finishStreaming();
				break;
		}
	}

	async function handleMicStart() {
		if (isRecording || isStreaming) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const recorder = new MediaRecorder(stream);
			chunksRef.current = [];

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.onstop = async () => {
				stream.getTracks().forEach((track) => track.stop());
				setIsRecording(false);

				const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
				if (blob.size === 0) return;

				const configRaw = localStorage.getItem("cafelua-config");
				const config = configRaw ? JSON.parse(configRaw) : null;
				// Use dedicated Google API key, fall back to main key for Gemini
				const googleKey =
					config?.googleApiKey ||
					(config?.provider === "gemini" ? config?.apiKey : null);
				if (!googleKey) return;

				const text = await transcribeAudio(blob, googleKey);
				if (text) {
					setInput((prev) => (prev ? `${prev} ${text}` : text));
					inputRef.current?.focus();
				}
			};

			recorderRef.current = recorder;
			recorder.start();
			setIsRecording(true);
		} catch (err) {
			Logger.warn("ChatPanel", "Microphone access failed", {
				error: String(err),
			});
			setIsRecording(false);
		}
	}

	function handleMicStop() {
		if (recorderRef.current?.state === "recording") {
			recorderRef.current.stop();
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
			{/* Header with session cost */}
			<div className="chat-header">
				<span className="chat-title">Alpha</span>
				<div className="chat-header-right">
					{totalSessionCost > 0 && (
						<span className="cost-badge session-cost">
							{formatCost(totalSessionCost)}
						</span>
					)}
					{onOpenSettings && (
						<button
							type="button"
							className="settings-icon-btn"
							onClick={onOpenSettings}
							title={t("chat.settings")}
						>
							&#9881;
						</button>
					)}
				</div>
			</div>

			{/* Messages */}
			<div className="chat-messages">
				{messages.map((msg) => (
					<div key={msg.id} className={`chat-message ${msg.role}`}>
						<div className="message-content">
							{msg.role === "assistant"
								? parseEmotion(msg.content).cleanText
								: msg.content}
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
						<div className="message-content">
							{streamingContent ? parseEmotion(streamingContent).cleanText : ""}
							<span className="cursor-blink">▌</span>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="chat-input-bar">
				<button
					type="button"
					className={`chat-mic-btn${isRecording ? " recording" : ""}`}
					onMouseDown={handleMicStart}
					onMouseUp={handleMicStop}
					onMouseLeave={handleMicStop}
					disabled={isStreaming}
					title={isRecording ? t("chat.recording") : "STT"}
				>
					{isRecording ? "⏺" : "🎤"}
				</button>
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={
						isRecording ? t("chat.recording") : t("chat.placeholder")
					}
					rows={1}
					disabled={isStreaming || isRecording}
					className="chat-input"
				/>
				<button
					type="button"
					onClick={handleSend}
					disabled={isStreaming || !input.trim()}
					className="chat-send-btn"
				>
					↑
				</button>
			</div>
		</div>
	);
}
