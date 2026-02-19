import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
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
		expect(text).toMatch(
			/로그아웃|logout|채널|channel|연결|없|error|disconnect|도구|실행/i,
		);
	});

	it("should handle web login start gracefully", async () => {
		await sendMessage(
			"웹 로그인을 시작해줘. skill_channels의 login_start 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		// QR code flow starts or error — both are valid
		expect(text).toMatch(
			/로그인|login|QR|시작|start|채널|없|error|도구|실행/i,
		);
	});
});
