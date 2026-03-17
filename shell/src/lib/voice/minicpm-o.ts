/**
 * MiniCPM-o local voice conversation provider.
 *
 * Connects to a Python bridge server that wraps MiniCPM-o 4.5's
 * streaming API as a WebSocket endpoint.
 *
 * Protocol:
 *   Client → Server: session.config, audio.append, text.send
 *   Server → Client: session.ready, audio.delta, transcript.output, turn.end, interrupted, error
 *
 * Audio: 16kHz PCM16 mono input → 24kHz PCM16 mono output (base64 encoded)
 * No API key required (local server).
 * No input transcription (model limitation — user speech not shown in chat).
 */
import { Logger } from "../logger";
import type { LiveProviderConfig, MiniCpmOConfig, VoiceSession } from "./types";

const DEFAULT_SERVER_URL = "ws://localhost:8765";

export function createMiniCpmOSession(): VoiceSession {
	let ws: WebSocket | null = null;
	let connected = false;

	const session: VoiceSession = {
		onAudio: null,
		onInputTranscript: null,
		onOutputTranscript: null,
		onToolCall: null,
		onTurnEnd: null,
		onInterrupted: null,
		onError: null,
		onDisconnect: null,

		get isConnected() {
			return connected;
		},

		async connect(config: LiveProviderConfig) {
			const cfg = config as MiniCpmOConfig;
			const baseUrl = (cfg.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/+$/, "");
			const wsUrl = `${baseUrl}/ws`;

			Logger.info("MiniCPM-o", "connecting", { url: wsUrl });

			ws = new WebSocket(wsUrl);

			return new Promise<void>((resolve, reject) => {
				if (!ws) return reject(new Error("WebSocket not created"));

				const timeout = setTimeout(() => {
					reject(new Error("Connection timeout"));
					ws?.close();
				}, 15000);

				ws.onopen = () => {
					Logger.info(
						"MiniCPM-o",
						"WebSocket connected, sending session.config",
					);
					ws?.send(
						JSON.stringify({
							type: "session.config",
							config: {
								system_instruction: cfg.systemInstruction ?? "",
								voice: cfg.voice,
							},
						}),
					);
				};

				ws.onmessage = (event) => {
					try {
						const msg = JSON.parse(event.data);
						if (msg.type === "session.ready") {
							clearTimeout(timeout);
							connected = true;
							Logger.info("MiniCPM-o", "session ready");
							resolve();
							return;
						}
						if (msg.type === "error") {
							clearTimeout(timeout);
							const err = new Error(msg.message || "Session error");
							reject(err);
							session.onError?.(err);
							return;
						}
						handleMessage(msg);
					} catch {
						// ignore malformed messages
					}
				};

				ws.onerror = () => {
					clearTimeout(timeout);
					const err = new Error("WebSocket error");
					reject(err);
					session.onError?.(err);
				};

				ws.onclose = () => {
					clearTimeout(timeout);
					const wasConnected = connected;
					connected = false;
					Logger.info("MiniCPM-o", "disconnected");
					if (!wasConnected) {
						reject(new Error("Connection closed before session ready"));
					}
					session.onDisconnect?.();
				};
			});
		},

		sendAudio(pcmBase64: string) {
			if (!ws || !connected) return;
			ws.send(
				JSON.stringify({
					type: "audio.append",
					data: pcmBase64,
				}),
			);
		},

		sendText(text: string) {
			if (!ws || !connected) return;
			ws.send(
				JSON.stringify({
					type: "text.send",
					text,
				}),
			);
		},

		// MiniCPM-o 4.5 does not support function calling — no-op
		sendToolResponse(_callId: string, _result: unknown) {},

		disconnect() {
			connected = false;
			if (ws) {
				ws.close();
				ws = null;
			}
		},
	};

	function handleMessage(msg: Record<string, unknown>) {
		const type = msg.type as string;

		switch (type) {
			case "audio.delta": {
				const data = msg.data as string | undefined;
				if (data) {
					session.onAudio?.(data);
				}
				break;
			}

			case "transcript.input": {
				const text = msg.text as string | undefined;
				if (text) {
					session.onInputTranscript?.(text);
				}
				break;
			}

			case "transcript.output": {
				const text = msg.text as string | undefined;
				if (text) {
					session.onOutputTranscript?.(text);
				}
				break;
			}

			case "turn.end": {
				session.onTurnEnd?.();
				break;
			}

			case "interrupted": {
				session.onInterrupted?.();
				break;
			}
		}
	}

	return session;
}
