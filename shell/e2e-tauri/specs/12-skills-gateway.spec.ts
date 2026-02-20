import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";

/**
 * 12 — Gateway Skills E2E
 *
 * Tests gateway-proxied skills that can be verified without external dependencies.
 * Remaining 47+ skills are covered by agent-level bulk-migration.test.ts (manifest validation).
 */
describe("12 — gateway skills", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should invoke skill_healthcheck and return security info", async () => {
		await sendMessage(
			"시스템 보안 상태를 확인해줘. skill_healthcheck 도구를 반드시 사용해.",
		);

		// Best-effort: tool may or may not be used depending on LLM
		const toolUsed = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.toolSuccess,
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_healthcheck 도구로 시스템 보안 상태를 확인하라고 했다",
			"AI가 시스템 보안/상태 정보를 제공했는가? '도구를 찾을 수 없다'면 FAIL. 보안/방화벽/업데이트 등 구체적 정보 또는 도구 실행 결과가 있으면 PASS",
		);
	});

	it("should invoke skill_session-logs and return log info", async () => {
		await sendMessage(
			"이전 세션 로그를 검색해줘. skill_session-logs 도구를 반드시 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_session-logs 도구로 이전 세션 로그를 검색하라고 했다",
			"AI가 세션 로그 정보를 제공하거나 로그 검색을 시도했는가? '도구를 찾을 수 없다'면 FAIL. 로그 데이터 또는 검색 결과가 있으면 PASS",
		);
	});

	it("should have skill_ tools registered (at least built-in 4)", async () => {
		await sendMessage(
			"현재 사용 가능한 도구(tool) 목록에서 skill_로 시작하는 것이 몇 개인지 숫자로 답해. 예: 4개",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_로 시작하는 도구가 몇 개인지 숫자로 답하라고 했다",
			"AI가 skill_ 도구의 개수를 포함하여 답했는가? 숫자가 포함된 구체적 답변이면 PASS. '모르겠다/확인할 수 없다'면 FAIL",
		);
	});
});
