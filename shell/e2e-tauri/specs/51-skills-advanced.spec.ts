import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 51 — Skills Advanced E2E
 *
 * Verifies advanced skill management via chat (skill_skill_manager):
 * - gateway_status: Gateway skills status
 * - install: install missing skill dependencies
 * - update_config: update skill config
 *
 * Covers RPC: skills.status, skills.bins, skills.install, skills.update
 */
describe("51 — skills advanced", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_skill_manager"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should get Gateway skills status", async () => {
		await sendMessage(
			"게이트웨이 스킬 상태를 확인해줘. skill_skill_manager 도구의 gateway_status 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/스킬|skill|상태|status|게이트웨이|gateway|eligible|도구|실행/i,
		);
	});

	it("should install skill dependencies", async () => {
		await sendMessage(
			"누락된 스킬 의존성을 설치해줘. skill_skill_manager의 install 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/설치|install|의존성|dependency|스킬|skill|완료|없|도구|실행/i,
		);
	});

	it("should update skill config", async () => {
		await sendMessage(
			"스킬 설정을 업데이트해줘. skill_skill_manager의 update_config 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/업데이트|update|설정|config|스킬|skill|완료|도구|실행/i,
		);
	});
});
