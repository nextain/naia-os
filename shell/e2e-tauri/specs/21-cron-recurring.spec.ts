import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";

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
		await assertSemantic(
			text,
			"skill_cron 도구로 매일 오전 9시 날씨 알림 반복 작업을 만들라고 했다",
			"AI가 반복 작업을 실제로 생성했는가? '도구를 찾을 수 없다'면 FAIL. 예약/반복 설정 확인이면 PASS",
		);
	});

	it("should show schedule info in job list", async () => {
		await sendMessage(
			"예약된 작업 목록 보여줘. skill_cron의 list를 사용해.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 예약된 작업 목록을 보여달라고 했다",
			"AI가 작업 목록/스케줄 정보를 보여줬는가? '도구를 찾을 수 없다'면 FAIL",
		);
	});

	it("should disable a recurring job", async () => {
		await sendMessage(
			"아까 만든 날씨 알림을 비활성화해줘. skill_cron의 update로 enabled를 false로 바꿔.",
		);

		await waitForToolSuccess();

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 날씨 알림을 비활성화하라고 했다",
			"AI가 작업을 비활성화/업데이트했는가? '도구를 찾을 수 없다'면 FAIL. 비활성화 확인이면 PASS",
		);
	});
});
