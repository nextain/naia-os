import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("05 — skill_system_status", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should execute skill_system_status and return memory info", async () => {
		await sendMessage(
			"시스템 메모리 상태 알려줘. skill_system_status 도구를 반드시 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/MB|GB|메모리|memory/i);
	});
});
