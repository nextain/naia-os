import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentResponseChunk, ProviderConfig } from "./types";

interface SendChatOptions {
	message: string;
	provider: ProviderConfig;
	history: { role: "user" | "assistant"; content: string }[];
	onChunk: (chunk: AgentResponseChunk) => void;
	requestId: string;
	ttsVoice?: string;
	ttsApiKey?: string;
	systemPrompt?: string;
}

export async function sendChatMessage(opts: SendChatOptions): Promise<void> {
	const {
		message,
		provider,
		history,
		onChunk,
		requestId,
		ttsVoice,
		ttsApiKey,
		systemPrompt,
	} = opts;

	const request = {
		type: "chat_request",
		requestId,
		provider,
		messages: [...history, { role: "user", content: message }],
		...(ttsVoice && { ttsVoice }),
		...(ttsApiKey && { ttsApiKey }),
		...(systemPrompt && { systemPrompt }),
	};

	// Listen for agent responses before sending to avoid race conditions
	const unlisten = await listen<string>("agent_response", (event) => {
		try {
			const raw =
				typeof event.payload === "string"
					? event.payload
					: JSON.stringify(event.payload);
			const chunk = JSON.parse(raw) as AgentResponseChunk;
			if (chunk.requestId !== requestId) return;
			onChunk(chunk);

			if (chunk.type === "finish" || chunk.type === "error") {
				unlisten();
			}
		} catch {
			// Ignore malformed events
		}
	});

	await invoke("send_to_agent_command", {
		message: JSON.stringify(request),
	});
}

export async function cancelChat(requestId: string): Promise<void> {
	await invoke("cancel_stream", { requestId });
}
