import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 41 — Agents CRUD E2E
 *
 * Verifies agent lifecycle via chat (skill_agents):
 * - create: create a test agent
 * - update: modify agent description
 * - files_set: create a file for agent
 * - delete: remove the test agent
 *
 * Covers RPC: agents.create, agents.update, agents.delete, agents.files.set
 */
describe("41 — agents CRUD", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_agents"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should create a test agent via skill_agents create", async () => {
		await sendMessage(
			"새 에이전트를 만들어줘. skill_agents 도구의 create 액션으로, name은 'e2e-test-agent', description은 'E2E test agent'로 설정해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_agents 도구의 create 액션으로 'e2e-test-agent' 에이전트를 생성하라고 했다",
			"AI가 skill_agents로 에이전트 생성을 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 에이전트가 생성되었다는 결과가 있으면 PASS",
		);
	});

	it("should update the test agent via skill_agents update", async () => {
		await sendMessage(
			"e2e-test-agent 에이전트의 description을 'Updated by E2E'로 수정해줘. skill_agents의 update 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_agents 도구의 update 액션으로 e2e-test-agent의 description을 수정하라고 했다",
			"AI가 skill_agents로 에이전트 수정을 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 에이전트가 수정/업데이트되었다는 결과가 있으면 PASS",
		);
	});

	it("should create a file for the agent via skill_agents files_set", async () => {
		await sendMessage(
			"e2e-test-agent 에이전트에 'test.md' 파일을 만들어줘. 내용은 '# E2E Test'. skill_agents의 files_set 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_agents 도구의 files_set 액션으로 에이전트에 파일을 생성하라고 했다",
			"AI가 skill_agents로 파일 생성을 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 파일이 생성/저장되었다는 결과가 있으면 PASS",
		);
	});

	it("should delete the test agent via skill_agents delete", async () => {
		await sendMessage(
			"e2e-test-agent 에이전트를 삭제해줘. skill_agents의 delete 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"skill_agents 도구의 delete 액션으로 e2e-test-agent 에이전트를 삭제하라고 했다",
			"AI가 skill_agents로 에이전트 삭제를 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 에이전트가 삭제되었다는 결과가 있으면 PASS",
		);
	});
});
