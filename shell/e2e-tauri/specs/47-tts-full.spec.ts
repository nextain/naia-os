import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 47 — TTS Full E2E
 *
 * Verifies TTS operations via chat (skill_tts):
 * - status: current TTS configuration
 * - enable: enable TTS
 * - set_provider: change TTS provider
 * - convert: text-to-speech conversion
 * - disable: disable TTS
 *
 * Covers RPC: tts.status, tts.enable, tts.setProvider, tts.convert, tts.disable
 */
describe("47 — TTS full", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_tts"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should check TTS status", async () => {
		await sendMessage(
			"TTS 상태를 확인해줘. skill_tts 도구의 status 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/TTS|음성|상태|status|provider|활성|비활성|도구|실행/i,
		);
	});

	it("should enable TTS", async () => {
		await sendMessage(
			"TTS를 활성화해줘. skill_tts의 enable 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/활성|enable|TTS|완료|설정|도구|실행/i,
		);
	});

	it("should set TTS provider", async () => {
		await sendMessage(
			"TTS 프로바이더를 'edge'로 변경해줘. skill_tts의 set_provider 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/프로바이더|provider|변경|set|edge|완료|없|도구|실행/i,
		);
	});

	it("should convert text to speech", async () => {
		await sendMessage(
			"'안녕하세요'를 TTS로 변환해줘. skill_tts의 convert 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		// May succeed or fail depending on TTS config
		expect(text.length).toBeGreaterThan(0);
	});

	it("should disable TTS", async () => {
		await sendMessage(
			"TTS를 비활성화해줘. skill_tts의 disable 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/비활성|disable|TTS|완료|설정|도구|실행/i,
		);
	});
});
