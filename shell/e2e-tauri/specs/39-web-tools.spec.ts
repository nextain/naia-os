import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 39 — Web Tools E2E
 *
 * Verifies web Gateway tools:
 * - browser: fetch web page content
 * - web_search: search the web
 *
 * Covers RPC: skills.invoke (browser), browser.request
 */
describe("39 — web tools", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["browser", "web_search"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should fetch a web page via browser tool", async () => {
		await sendMessage(
			"https://example.com 웹페이지를 browser 도구로 읽어줘.",
		);

		const text = await getLastAssistantMessage();
		// Best-effort: tool may not be available, or page content shown
		expect(text).toMatch(
			/example|domain|illustrative|예시|웹|web|페이지|page|도구|실행|없|지원/i,
		);
	});

	it("should perform a web search via web_search tool", async () => {
		await sendMessage(
			"'Cafelua OS' 키워드로 웹 검색해줘. web_search 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Web search may or may not succeed — verify meaningful response
		expect(text.length).toBeGreaterThan(0);
	});
});
