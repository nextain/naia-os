import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 46 — Channels Operations E2E
 *
 * Verifies channel operations via chat (skill_channels):
 * - logout: disconnect a channel (graceful error if none connected)
 * - login_start: start QR login (graceful error — no QR scan)
 *
 * Covers RPC: channels.logout, web.login.start, web.login.wait (error path)
 */
describe("46 — channels operations", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_channels"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should handle channel logout gracefully", async () => {
		await sendMessage(
			"채널 로그아웃을 해줘. skill_channels 도구의 logout 액션을 사용해. channel은 'telegram'.",
		);

		const text = await getLastAssistantMessage();
		// Likely no channel connected — graceful error is valid
		await assertSemantic(
			text,
			"skill_channels 도구의 logout 액션으로 채널 로그아웃을 요청했다",
			"AI가 skill_channels로 채널 로그아웃을 시도했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 로그아웃 결과나 연결된 채널이 없다는 graceful 에러가 있으면 PASS",
		);
	});

	it("should handle web login start gracefully", async () => {
		await sendMessage(
			"웹 로그인을 시작해줘. skill_channels의 login_start 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		// QR code flow starts or error — both are valid
		await assertSemantic(
			text,
			"skill_channels 도구의 login_start 액션으로 웹 로그인 시작을 요청했다",
			"AI가 skill_channels로 웹 로그인 시작을 시도했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 로그인/QR 코드 시작 결과나 graceful 에러가 있으면 PASS",
		);
	});
});
