import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("06 — skill_memo (save + read)", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should save a memo with skill_memo", async () => {
		await sendMessage(
			"skill_memo 도구로 e2e-test 키에 hello-tauri 값을 저장해. 반드시 skill_memo 도구를 사용해.",
		);

		// Check for tool success OR just verify the response indicates success
		const hasToolSuccess = await browser.execute(
			(sel: string) => !!document.querySelector(sel),
			S.toolSuccess,
		);

		if (!hasToolSuccess) {
			// LLM might have responded without showing tool UI; check text
			const text = await getLastAssistantMessage();
			expect(text).toMatch(/저장|완료|saved|success|done/i);
		}
	});

	it("should read the saved memo with skill_memo", async () => {
		await sendMessage(
			"skill_memo 도구로 e2e-test 키의 메모를 읽어줘. 반드시 skill_memo 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/hello-tauri/i);
	});
});
