import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { S } from "./selectors.js";

const UI_TRACE_DIR = resolve(process.cwd(), "e2e-tauri/.artifacts");
const UI_TRACE_FILE = resolve(UI_TRACE_DIR, "ui-message-trace.ndjson");

type StopLogger = () => Promise<void>;

async function captureUiSnapshot(context: string): Promise<void> {
	try {
		const snapshot = await browser.execute(() => {
			const allAssistant = Array.from(
				document.querySelectorAll(".chat-message.assistant .message-content"),
			)
				.map((el) => el.textContent?.trim() ?? "")
				.filter((t) => t.length > 0);
			const lastAssistant = allAssistant[allAssistant.length - 1] ?? "";
			const toolNames = Array.from(document.querySelectorAll(".tool-activity .tool-name"))
				.map((el) => el.textContent?.trim() ?? "")
				.filter((t) => t.length > 0);
			return {
				lastAssistant,
				assistantCount: allAssistant.length,
				toolNames,
				hasToolSuccess: !!document.querySelector(".tool-activity.tool-success"),
				hasToolError: !!document.querySelector(".tool-activity.tool-error"),
				isStreaming: !!document.querySelector(".cursor-blink"),
			};
		});
		mkdirSync(UI_TRACE_DIR, { recursive: true });
		appendFileSync(
			UI_TRACE_FILE,
			JSON.stringify({
				ts: new Date().toISOString(),
				context,
				...snapshot,
			}) + "\n",
		);
	} catch {
		// best-effort trace; never block tests on tracing failure
	}
}

function startRealtimeUiLogger(context: string, intervalMs = 1000): StopLogger {
	let alive = true;
	const timer = setInterval(() => {
		if (!alive) return;
		void captureUiSnapshot(context);
	}, intervalMs);
	void captureUiSnapshot(`${context}:start`);
	return async () => {
		alive = false;
		clearInterval(timer);
		await captureUiSnapshot(`${context}:stop`);
	};
}
function createDeltaTracer(context: string) {
	let lastSignature = "";
	return async () => {
		try {
			const snapshot = await browser.execute(() => {
				const allAssistant = Array.from(
					document.querySelectorAll(".chat-message.assistant .message-content"),
				)
					.map((el) => el.textContent?.trim() ?? "")
					.filter((t) => t.length > 0);
				const toolNames = Array.from(document.querySelectorAll(".tool-activity .tool-name"))
					.map((el) => el.textContent?.trim() ?? "")
					.filter((t) => t.length > 0);
				return {
					allAssistant,
					toolNames,
					hasToolSuccess: !!document.querySelector(".tool-activity.tool-success"),
					hasToolError: !!document.querySelector(".tool-activity.tool-error"),
					isStreaming: !!document.querySelector(".cursor-blink"),
				};
			});
			const signature = JSON.stringify(snapshot);
			if (signature === lastSignature) return;
			lastSignature = signature;
			mkdirSync(UI_TRACE_DIR, { recursive: true });
			appendFileSync(
				UI_TRACE_FILE,
				JSON.stringify({
					ts: new Date().toISOString(),
					context,
					...snapshot,
				}) + "\n",
			);
		} catch {
			// best-effort trace
		}
	};
}

/**
 * Count existing assistant messages (completed, not streaming) before sending.
 */
export async function countCompletedAssistantMessages(): Promise<number> {
	return browser.execute((sel: string) => {
		// Only count non-streaming assistant messages
		return document.querySelectorAll(sel).length;
	}, ".chat-message.assistant:not(.streaming) .message-content");
}

/**
 * Return all completed assistant messages.
 */
export async function getCompletedAssistantMessages(): Promise<string[]> {
	return browser.execute(() => {
		return Array.from(
			document.querySelectorAll(".chat-message.assistant:not(.streaming) .message-content"),
		)
			.map((el) => el.textContent?.trim() ?? "")
			.filter((t) => t.length > 0);
	});
}

/**
 * Return assistant messages added after `beforeCount`.
 */
export async function getNewAssistantMessages(beforeCount: number): Promise<string[]> {
	const all = await getCompletedAssistantMessages();
	return all.slice(beforeCount);
}

/**
 * Set textarea value via JS (avoids React re-render stale element issues)
 * and click the send button.
 */
async function setTextareaAndSend(selector: string, text: string): Promise<void> {
	await browser.execute(
		(sel: string, val: string) => {
			const el = document.querySelector(sel) as HTMLTextAreaElement | null;
			if (!el) throw new Error(`Element ${sel} not found`);
			el.focus();
			const nativeSetter = Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				"value",
			)?.set;
			if (nativeSetter) {
				nativeSetter.call(el, val);
			} else {
				el.value = val;
			}
			el.dispatchEvent(new Event("input", { bubbles: true }));
		},
		selector,
		text,
	);

	// Wait for React state to settle, then click send button
	await browser.pause(100);
	const sendBtn = await $(S.chatSendBtn);
	await sendBtn.click();
}

/**
 * Send a message in the chat input and wait for the assistant to finish responding.
 * Uses DOM queries (not element refs) to avoid stale element issues in WebKitGTK.
 */
export async function sendMessage(text: string): Promise<void> {
	const traceDelta = createDeltaTracer(`sendMessage:${text.slice(0, 80)}`);
	const beforeCount = await countCompletedAssistantMessages();

	try {
		await traceDelta();
		const input = await $(S.chatInput);
		await input.waitForEnabled({ timeout: 10_000 });

		await setTextareaAndSend(S.chatInput, text);

		// Wait for streaming to start — query DOM fresh each check
		await browser.waitUntil(
			async () => {
				await traceDelta();
				return browser.execute(
					(sel: string) => !!document.querySelector(sel),
					S.cursorBlink,
				);
			},
			{ timeout: 60_000, timeoutMsg: "Streaming did not start (cursor-blink)" },
		);

		// Wait for streaming to finish — cursor-blink disappears
		await browser.waitUntil(
			async () => {
				await traceDelta();
				return browser.execute(
					(sel: string) => !document.querySelector(sel),
					S.cursorBlink,
				);
			},
			{ timeout: 180_000, timeoutMsg: "Streaming did not finish (cursor-blink still visible)" },
		);

		// Wait for a new completed assistant message with non-empty text
		await browser.waitUntil(
			async () => {
				await traceDelta();
				const count = await countCompletedAssistantMessages();
				if (count <= beforeCount) return false;
				const text = await browser.execute(
					(sel: string) => {
						const msgs = document.querySelectorAll(sel);
						return msgs[msgs.length - 1]?.textContent?.trim() ?? "";
					},
					".chat-message.assistant:not(.streaming) .message-content",
				);
				return text.length > 0;
			},
			{ timeout: 30_000, timeoutMsg: "Completed assistant message did not appear" },
		);

		// Some providers emit a "Tool Call" placeholder first.
		// E2E should not treat this as final success: require a resolved follow-up message
		// or visible tool activity within timeout.
		const latest = await browser.execute(() => {
			const msgs = document.querySelectorAll(
				".chat-message.assistant:not(.streaming) .message-content",
			);
			return msgs[msgs.length - 1]?.textContent?.trim() ?? "";
		});
		const placeholder =
			/Tool Call:|print\s*\(\s*skill_[a-z0-9_-]+\s*\)|잠시만 기다려/i.test(latest);
		if (placeholder) {
			const resolved = await browser
				.waitUntil(
					async () => {
						await traceDelta();
						return browser.execute(
							(baseCount: number) => {
								const msgs = document.querySelectorAll(
									".chat-message.assistant:not(.streaming) .message-content",
								);
								const toolActivity = document.querySelector(
									".tool-activity.tool-success, .tool-activity.tool-error",
								);
								if (toolActivity) return true;
								if (msgs.length <= baseCount) return false;
								const last = msgs[msgs.length - 1]?.textContent?.trim() ?? "";
								return !/Tool Call:|print\s*\(\s*skill_[a-z0-9_-]+\s*\)|잠시만 기다려/i.test(last);
							},
							beforeCount + 1,
						);
					},
					{
						timeout: 25_000,
						timeoutMsg:
							"Tool placeholder emitted but no resolved tool result/follow-up message appeared",
					},
				)
				.then(() => true)
				.catch(() => false);
			if (!resolved) {
				throw new Error(
					"E2E invalid response: assistant stopped at tool placeholder without execution result",
				);
			}
		}
	} finally {
		await traceDelta();
	}
}

/**
 * Get the text content of the last completed assistant message.
 */
export async function getLastAssistantMessage(): Promise<string> {
	return browser.execute(() => {
		const msgs = document.querySelectorAll(
			".chat-message.assistant:not(.streaming) .message-content",
		);
		if (msgs.length === 0) throw new Error("No assistant messages found");
		return msgs[msgs.length - 1]?.textContent?.trim() ?? "";
	});
}

/**
 * Wait for at least one tool-success activity to appear in the page.
 */
export async function waitForToolSuccess(): Promise<void> {
	try {
		await browser.waitUntil(
			async () => {
				const hardError = await browser.execute(() => {
					const msgs = document.querySelectorAll(
						".chat-message.assistant .message-content",
					);
					const last = msgs[msgs.length - 1]?.textContent?.trim() ?? "";
					return /\[오류\]|unauthorized|gateway token missing|API key not valid|Bad Request/i.test(
						last,
					);
				});
				if (hardError) {
					throw new Error("Hard error text detected in assistant message");
				}
				return browser.execute(
					(sel: string) => !!document.querySelector(sel),
					S.toolSuccess,
				);
			},
			{ timeout: 60_000, timeoutMsg: "Tool success activity did not appear" },
		);
	} catch (err) {
		const detail = await browser.execute(() => {
			const msgs = document.querySelectorAll(
				".chat-message.assistant .message-content",
			);
			const lastAssistant =
				msgs[msgs.length - 1]?.textContent?.trim()?.slice(0, 400) ?? "(none)";
			const tools = Array.from(
				document.querySelectorAll(".tool-activity .tool-name"),
			).map((el) => el.textContent?.trim() ?? "");
			return {
				lastAssistant,
				tools,
			};
		});
		throw new Error(
			`Tool success activity did not appear. lastAssistant="${detail.lastAssistant}" tools=${JSON.stringify(detail.tools)} cause=${String(err)}`,
		);
	}
}

/**
 * Get the name of the latest tool activity shown in the UI.
 */
export async function getLastToolName(): Promise<string> {
	return browser.execute(() => {
		const items = document.querySelectorAll(".tool-activity .tool-name");
		return items[items.length - 1]?.textContent?.trim() ?? "";
	});
}

/**
 * Ask for an independent verification using a spawned sub-agent.
 * Returns the final assistant verification text.
 */
export async function verifyWithSubAgent(subject: string): Promise<string> {
	await sendMessage(
		`방금 결과를 독립적으로 검증해줘. sessions_spawn 도구를 사용해서 교차검증 후 ` +
			`반드시 'VALID' 또는 'INVALID'로 시작해서 한 문장으로 답해. 대상: ${subject}`,
	);
	await waitForToolSuccess();
	return getLastAssistantMessage();
}
