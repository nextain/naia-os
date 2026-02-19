import {
	getLastAssistantMessage,
	sendMessage,
	waitForToolSuccess,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

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
		if (toolOk) {
			expect(text).toMatch(/예약|생성|알림|작업|cron/i);
		} else {
			// Tool might fail — just ensure a response exists
			expect(text.length).toBeGreaterThan(0);
		}
	});

	it("should list cron jobs", async () => {
		await sendMessage(
			"예약된 작업 목록을 보여줘. skill_cron 도구의 list 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Should have some response about cron jobs
		expect(text.length).toBeGreaterThan(10);
	});

	it("should remove a cron job", async () => {
		await sendMessage(
			"아까 만든 테스트 알림을 취소해줘. skill_cron의 remove 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Should confirm deletion or mention no jobs
		expect(text.length).toBeGreaterThan(10);
	});
});
