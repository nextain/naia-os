import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";

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
		await assertSemantic(
			text,
			"skill_weather 도구로 서울 날씨를 알려달라고 했다",
			"AI가 서울의 실제 날씨/기온 정보(°C, 맑음/흐림 등)를 제공했는가? '도구를 찾을 수 없다/사용할 수 없다/미지원'이면 FAIL. 실제 기상 데이터가 포함되어야 PASS",
		);
	});

	it("should get weather for another city", async () => {
		await sendMessage(
			"도쿄 날씨는? skill_weather 도구를 사용해서 알려줘.",
		);

		const text = await getLastAssistantMessage();
		expect(text).not.toMatch(/\[오류\]|API key not valid|Bad Request/i);
		await assertSemantic(
			text,
			"skill_weather 도구로 도쿄(Tokyo) 날씨를 알려달라고 했다",
			"AI가 도쿄의 실제 날씨/기온 정보를 제공했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 실제 기상 데이터가 포함되어야 PASS",
		);
	});
});
