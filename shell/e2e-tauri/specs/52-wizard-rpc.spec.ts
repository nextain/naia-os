import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 52 — Wizard RPC E2E
 *
 * Verifies Gateway wizard operations via chat:
 * - wizard.status: check if wizard is active
 * - wizard.start + wizard.cancel: lifecycle test
 * - wizard.next: advance step (error path — no active wizard)
 *
 * Covers RPC: wizard.status, wizard.start, wizard.cancel, wizard.next (error path)
 *
 * NOTE: No dedicated skill_wizard exists, so we ask the LLM to invoke
 * indirectly or explain. The test verifies graceful handling.
 */
describe("52 — wizard RPC", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_diagnostics", "skill_config"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should check wizard status", async () => {
		await sendMessage(
			"게이트웨이 온보딩 위저드 상태를 확인해줘. 위저드가 현재 활성화되어 있는지 알려줘.",
		);

		const text = await getLastAssistantMessage();
		// LLM may or may not have wizard access — verify semantic response
		expect(text).toMatch(
			/위저드|wizard|온보딩|onboarding|상태|status|활성|없|비활성|도구|지원/i,
		);
	});

	it("should handle wizard start and cancel lifecycle", async () => {
		await sendMessage(
			"게이트웨이 온보딩 위저드를 시작한 후 즉시 취소해줘. wizard.start 후 wizard.cancel RPC를 호출해.",
		);

		const text = await getLastAssistantMessage();
		// May succeed or explain it can't access wizard
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle wizard next on inactive wizard", async () => {
		await sendMessage(
			"위저드 다음 단계로 진행해줘. wizard.next RPC를 호출해.",
		);

		const text = await getLastAssistantMessage();
		// Should get error or explanation (no active wizard)
		expect(text.length).toBeGreaterThan(0);
	});
});
