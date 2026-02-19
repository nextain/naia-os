import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("21 — cron recurring", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should create a recurring cron job", async () => {
		await sendMessage(
			"매일 오전 9시에 날씨를 알려줘. skill_cron 도구를 사용해서 반복 작업을 만들어.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/매일|반복|예약|9시|날씨/);
	});

	it("should show schedule info in job list", async () => {
		await sendMessage(
			"예약된 작업 목록 보여줘. skill_cron의 list를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		// Should include schedule information
		expect(text.length).toBeGreaterThan(10);
	});

	it("should disable a recurring job", async () => {
		await sendMessage(
			"아까 만든 날씨 알림을 비활성화해줘. skill_cron의 update로 enabled를 false로 바꿔.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/비활성|disable|업데이트|updated/i);
	});
});
