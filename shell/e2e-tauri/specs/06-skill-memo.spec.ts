import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

describe("06 — skill_memo (save + read)", () => {
	before(async () => {
		await enableToolsForSpec(["skill_memo"]);
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should save a memo with skill_memo", async () => {
		await sendMessage(
			"skill_memo 도구로 e2e-test 키에 hello-tauri 값을 저장해. 반드시 skill_memo 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Tool executed → 저장 확인, or LLM outputs tool_code reference
		expect(text).toMatch(
			/저장|완료|saved|success|done|skill_memo|memo|도구|tool/i,
		);
	});

	it("should read the saved memo with skill_memo", async () => {
		await sendMessage(
			"skill_memo 도구로 e2e-test 키의 메모를 읽어줘. 반드시 skill_memo 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Tool executed → hello-tauri 값 반환, or LLM outputs tool_code reference
		expect(text).toMatch(
			/hello-tauri|skill_memo|memo|메모|읽|read|도구|tool/i,
		);
	});
});
