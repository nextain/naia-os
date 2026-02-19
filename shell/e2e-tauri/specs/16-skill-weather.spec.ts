import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

describe("16 — skill_weather", () => {
	before(async () => {
		// Ensure enableTools + skill_weather visible
		await browser.execute(() => {
			const raw = localStorage.getItem("cafelua-config");
			const config = raw ? JSON.parse(raw) : {};
			config.enableTools = true;
			if (Array.isArray(config.disabledSkills)) {
				config.disabledSkills = config.disabledSkills.filter(
					(s: string) => s !== "skill_weather",
				);
			}
			const allowed = config.allowedTools || [];
			if (!allowed.includes("skill_weather")) {
				allowed.push("skill_weather");
			}
			config.allowedTools = allowed;
			localStorage.setItem("cafelua-config", JSON.stringify(config));
		});
		await browser.refresh();
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	it("should get weather for Seoul", async () => {
		await sendMessage(
			"서울 날씨 알려줘. skill_weather 도구를 반드시 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).not.toMatch(/\[오류\]|API key not valid|Bad Request/i);
		expect(text).toMatch(
			/°C|기온|temperature|weather|맑|흐|비|눈|서울|Seoul|없어|없습니다|미지원|not available|도구|실행/i,
		);
	});

	it("should get weather for another city", async () => {
		await sendMessage(
			"도쿄 날씨는? skill_weather 도구를 사용해서 알려줘.",
		);

		const text = await getLastAssistantMessage();
		expect(text).not.toMatch(/\[오류\]|API key not valid|Bad Request/i);
		expect(text).toMatch(
			/°C|기온|temperature|weather|Tokyo|도쿄|없어|없습니다|미지원|not available|도구|실행/i,
		);
	});
});
