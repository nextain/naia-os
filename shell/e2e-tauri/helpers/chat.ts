import { S } from "./selectors.js";

/**
 * Count existing assistant messages (completed, not streaming) before sending.
 */
async function countCompletedAssistantMessages(): Promise<number> {
	return browser.execute((sel: string) => {
		// Only count non-streaming assistant messages
		return document.querySelectorAll(sel).length;
	}, ".chat-message.assistant:not(.streaming) .message-content");
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
	const beforeCount = await countCompletedAssistantMessages();

	const input = await $(S.chatInput);
	await input.waitForEnabled({ timeout: 10_000 });

	await setTextareaAndSend(S.chatInput, text);

	// Wait for streaming to start — query DOM fresh each check
	await browser.waitUntil(
		async () => {
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
	await browser.waitUntil(
		async () => {
			return browser.execute(
				(sel: string) => !!document.querySelector(sel),
				S.toolSuccess,
			);
		},
		{ timeout: 60_000, timeoutMsg: "Tool success activity did not appear" },
	);
}
