import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
	ChannelAdapter,
	ChannelMessage,
	ChannelResponse,
} from "./types.js";

interface GoogleChatConfig {
	projectId: string;
	/** HTTP endpoint port for Google Chat webhook */
	port: number;
}

interface GoogleChatWebhookPayload {
	type: string;
	message?: {
		name: string;
		text: string;
		sender: {
			name: string;
			displayName: string;
			type: string;
		};
		space: {
			name: string;
			type: string;
		};
		createTime: string;
	};
	space?: {
		name: string;
	};
}

interface GoogleChatResponsePayload {
	text: string;
	thread?: { name: string };
}

export class GoogleChatAdapter implements ChannelAdapter {
	readonly platform = "google-chat";
	private config: GoogleChatConfig;
	private server: ReturnType<typeof createServer> | null = null;
	private connected = false;
	private messageHandler:
		| ((msg: ChannelMessage) => Promise<ChannelResponse>)
		| null = null;

	constructor(config: GoogleChatConfig) {
		this.config = config;
	}

	async start(): Promise<void> {
		this.server = createServer((req, res) =>
			this.handleRequest(req, res),
		);

		return new Promise((resolve) => {
			this.server!.listen(this.config.port, () => {
				this.connected = true;
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.server.close(() => {
					this.connected = false;
					resolve();
				});
			} else {
				this.connected = false;
				resolve();
			}
		});
	}

	isConnected(): boolean {
		return this.connected;
	}

	onMessage(
		handler: (msg: ChannelMessage) => Promise<ChannelResponse>,
	): void {
		this.messageHandler = handler;
	}

	/** Parse Google Chat webhook payload into ChannelMessage */
	parseWebhookPayload(
		payload: GoogleChatWebhookPayload,
	): ChannelMessage | undefined {
		if (payload.type !== "MESSAGE" || !payload.message) return undefined;

		const msg = payload.message;

		// Ignore bot messages
		if (msg.sender.type === "BOT") return undefined;

		return {
			id: msg.name,
			channelId: msg.space.name,
			userId: msg.sender.name,
			userName: msg.sender.displayName,
			text: msg.text,
			platform: "google-chat",
			isDM: msg.space.type === "DM",
			timestamp: new Date(msg.createTime).getTime(),
		};
	}

	/** Format ChannelResponse for Google Chat API */
	formatResponse(response: ChannelResponse): GoogleChatResponsePayload {
		const result: GoogleChatResponsePayload = {
			text: response.text,
		};
		if (response.replyToId) {
			result.thread = { name: response.replyToId };
		}
		return result;
	}

	private handleRequest(req: IncomingMessage, res: ServerResponse): void {
		if (req.method !== "POST") {
			res.writeHead(405);
			res.end();
			return;
		}

		const MAX_BODY = 64 * 1024; // 64KB
		let body = "";
		let aborted = false;
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > MAX_BODY) {
				aborted = true;
				res.writeHead(413);
				res.end();
				req.destroy();
			}
		});

		req.on("end", () => {
			if (aborted) return;
			try {
				const payload = JSON.parse(body) as GoogleChatWebhookPayload;
				const message = this.parseWebhookPayload(payload);

				if (!message || !this.messageHandler) {
					res.writeHead(200);
					res.end(JSON.stringify({ text: "" }));
					return;
				}

				this.messageHandler(message)
					.then((response) => {
						const formatted = this.formatResponse(response);
						res.writeHead(200, {
							"Content-Type": "application/json",
						});
						res.end(JSON.stringify(formatted));
					})
					.catch(() => {
						res.writeHead(500);
						res.end(
							JSON.stringify({ text: "Internal error" }),
						);
					});
			} catch {
				res.writeHead(400);
				res.end(JSON.stringify({ text: "Invalid payload" }));
			}
		});
	}
}
