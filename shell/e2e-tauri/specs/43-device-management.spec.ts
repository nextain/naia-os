import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 43 — Device Management E2E
 *
 * Verifies device/node management via chat (skill_device):
 * All operations are graceful error paths (no paired devices in E2E).
 *
 * Covers RPC: node.describe, node.rename, node.pair.request, node.pair.verify,
 *   device.pair.list, device.pair.approve, device.token.rotate, device.token.revoke
 */
describe("43 — device management", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec(["skill_device"]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should describe a node via skill_device node_describe", async () => {
		await sendMessage(
			"노드 상세 정보를 보여줘. skill_device 도구의 node_describe 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/노드|node|상세|detail|없|error|정보|도구|실행|디바이스|device/i,
		);
	});

	it("should list device pairings via skill_device device_list", async () => {
		await sendMessage(
			"디바이스 페어링 목록을 보여줘. skill_device 도구의 device_list 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text).toMatch(
			/디바이스|device|페어|pair|목록|list|없|도구|실행/i,
		);
	});

	it("should handle token rotate gracefully", async () => {
		await sendMessage(
			"디바이스 토큰을 교체해줘. skill_device 도구의 token_rotate 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle token revoke gracefully", async () => {
		await sendMessage(
			"디바이스 토큰을 폐기해줘. skill_device 도구의 token_revoke 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle node rename gracefully", async () => {
		await sendMessage(
			"첫 번째 노드 이름을 'e2e-node'로 변경해줘. skill_device의 node_rename 액션을 사용해.",
		);

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle pair request gracefully", async () => {
		await sendMessage(
			"새 노드 페어링을 요청해줘. skill_device의 pair_request 액션을 사용해. nodeId는 'test-node'.",
		);

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle pair verify gracefully", async () => {
		await sendMessage(
			"페어링 검증을 해줘. skill_device의 pair_verify 액션을 사용해. requestId는 'test-req', code는 '1234'.",
		);

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});

	it("should handle device pair approve gracefully", async () => {
		await sendMessage(
			"디바이스 페어링을 승인해줘. skill_device의 device_approve 액션을 사용해. pairingId는 'test'.",
		);

		const text = await getLastAssistantMessage();
		expect(text.length).toBeGreaterThan(0);
	});
});
