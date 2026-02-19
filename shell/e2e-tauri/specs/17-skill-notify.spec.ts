import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 17 — Notification Skills E2E
 *
 * Verifies that notification skills (Slack/Discord) are registered
 * and handle missing webhook configuration gracefully.
 * Note: actual webhook delivery is not tested here (no real webhooks).
 */
describe("17 — notification skills", () => {
	before(async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });

		// Pre-approve notification skills
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			if (!raw) return;
			const config = JSON.parse(raw);
			const allowed = config.allowedTools || [];
			for (const skill of ["skill_notify_slack", "skill_notify_discord"]) {
				if (!allowed.includes(skill)) {
					allowed.push(skill);
				}
			}
			config.allowedTools = allowed;
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		});
	});

	it("should find notification skills via skill manager", async () => {
		await sendMessage(
			"notify 관련 스킬을 검색해줘. skill_skill_manager 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/notify_slack|notify_discord|알림/i);
	});

	it("should explain webhook config when Slack webhook is not set", async () => {
		await sendMessage(
			"Slack으로 '테스트 메시지' 보내줘. skill_notify_slack 도구를 반드시 사용해.",
		);

		const text = await getLastAssistantMessage();
		// Should mention webhook setup since no webhook is configured in test env
		expect(text).toMatch(/webhook|설정|config|SLACK_WEBHOOK_URL/i);
	});

	it("should explain webhook config when Discord webhook is not set", async () => {
		await sendMessage(
			"Discord로 '테스트' 알림 보내줘. skill_notify_discord 도구를 반드시 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(/webhook|설정|config|DISCORD_WEBHOOK_URL/i);
	});
});
