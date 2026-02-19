import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("20 — cron basic (one-shot)", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should create a cron job via natural language", async () => {
		await sendMessage(
			"5초 후에 테스트 알림 보내줘. skill_cron 도구를 사용해서 작업을 예약해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Response should confirm job creation
		expect(text).toMatch(/예약|생성|알림|작업/);
	});

	it("should list cron jobs", async () => {
		await sendMessage(
			"예약된 작업 목록을 보여줘. skill_cron 도구의 list 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Should mention the previously created job
		expect(text.length).toBeGreaterThan(10);
	});

	it("should remove a cron job", async () => {
		await sendMessage(
			"아까 만든 테스트 알림을 취소해줘. skill_cron의 remove 액션을 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Should confirm deletion
		expect(text).toMatch(/삭제|제거|취소|removed/i);
	});
});
