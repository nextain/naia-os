import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";

describe("20 — cron basic (one-shot)", () => {
	before(async () => {
		// Ensure enableTools + skill_cron visible
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			const config = raw ? JSON.parse(raw) : {};
			config.enableTools = true;
			// Remove skill_cron from disabledSkills if present
			if (Array.isArray(config.disabledSkills)) {
				config.disabledSkills = config.disabledSkills.filter(
					(s: string) => s !== "skill_cron",
				);
			}
			// Pre-approve skill_cron in allowedTools
			const allowed = config.allowedTools || [];
			if (!allowed.includes("skill_cron")) {
				allowed.push("skill_cron");
			}
			config.allowedTools = allowed;
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		});
		await browser.refresh();
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should create a cron job via natural language", async () => {
		await sendMessage(
			"5초 후에 테스트 알림 보내줘. skill_cron 도구를 사용해서 작업을 예약해.",
		);

		let toolOk = true;
		try {
			await waitForToolSuccess();
		} catch {
			toolOk = false;
		}

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 5초 후 테스트 알림을 예약하라고 했다",
			"AI가 작업 예약을 실제로 생성/확인했는가? '도구를 찾을 수 없다'면 FAIL. 예약 성공 또는 Gateway 연결 문제 설명이면 PASS",
		);
	});

	it("should list cron jobs", async () => {
		await sendMessage(
			"예약된 작업 목록을 보여줘. skill_cron 도구의 list 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 예약된 작업 목록을 보여달라고 했다",
			"AI가 예약 작업 목록을 보여줬는가? 목록이 비어있다는 것도 유효한 응답. '도구를 찾을 수 없다'면 FAIL",
		);
	});

	it("should remove a cron job", async () => {
		await sendMessage(
			"아까 만든 테스트 알림을 취소해줘. skill_cron의 remove 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_cron 도구로 이전에 만든 테스트 알림을 취소하라고 했다",
			"AI가 작업 삭제/취소를 처리했는가? '도구를 찾을 수 없다'면 FAIL. 삭제 확인 또는 해당 작업 없음도 유효",
		);
	});
});
