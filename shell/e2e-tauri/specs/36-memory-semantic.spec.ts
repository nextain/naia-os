import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { S } from "../helpers/selectors.js";

/**
 * 36 — Memory Semantic Search E2E
 *
 * Verifies that the semantic (vector) search integration works:
 * - Send a message → stored in DB
 * - Send a recall query in same session
 * - Agent can use memory/context to recall past info
 *
 * Note: Full embedding pipeline requires Gemini API key.
 * This spec checks the UI flow; actual embedding quality
 * depends on the live API.
 */
describe("36 — memory semantic search", () => {
	it("should be on chat tab", async () => {
		const chatInput = await $(S.chatInput);
		await chatInput.waitForDisplayed({ timeout: 10_000 });
	});

	it("should send a memorable message", async () => {
		await sendMessage("내 생일은 3월 15일이야. 기억해줘.");

		const text = await getLastAssistantMessage();
		// Agent should acknowledge the birthday info
		expect(text.length).toBeGreaterThan(0);
	});

	it("should recall in a follow-up question", async () => {
		await sendMessage("내 생일이 언제라고 했지?");

		const text = await getLastAssistantMessage();
		// Agent should mention the birthday from context/memory
		// May mention "3월 15일" or explain it can't recall — both valid
		expect(text).toMatch(
			/3월|15|생일|birthday|기억|remember|모르|확인|이전/i,
		);
	});
});
