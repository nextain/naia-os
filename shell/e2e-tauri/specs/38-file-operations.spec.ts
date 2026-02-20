import {
	getLastAssistantMessage,
	sendMessage,
} from "../helpers/chat.js";
import { autoApprovePermissions } from "../helpers/permissions.js";
import { S } from "../helpers/selectors.js";
import { assertSemantic } from "../helpers/semantic.js";
import { enableToolsForSpec } from "../helpers/settings.js";

/**
 * 38 — File Operations E2E
 *
 * Verifies file Gateway tools (all go through exec.bash):
 * - write_file: create a file
 * - read_file: read file content
 * - search_files: find files
 * - apply_diff: modify file content
 *
 * Covers RPC: exec.bash (via read_file, write_file, search_files, apply_diff)
 */
describe("38 — file operations", () => {
	let dispose: (() => void) | undefined;

	before(async () => {
		await enableToolsForSpec([
			"write_file",
			"read_file",
			"search_files",
			"apply_diff",
			"execute_command",
		]);
		dispose = autoApprovePermissions().dispose;
		const chatInput = await $(S.chatInput);
		await chatInput.waitForEnabled({ timeout: 15_000 });
	});

	after(() => {
		dispose?.();
	});

	it("should write a file via write_file tool", async () => {
		await sendMessage(
			"/tmp/cafelua-e2e-test.txt 파일에 'hello from e2e' 내용을 작성해줘. write_file 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"/tmp/cafelua-e2e-test.txt 파일에 'hello from e2e' 내용을 작성해줘 (write_file)",
			"AI가 write_file으로 파일 작성을 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 파일을 작성/생성 완료했다고 안내하면 PASS",
		);
	});

	it("should read a file via read_file tool", async () => {
		await sendMessage(
			"/tmp/cafelua-e2e-test.txt 파일 내용을 읽어줘. read_file 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"/tmp/cafelua-e2e-test.txt 파일 내용을 읽어줘 (read_file)",
			"AI가 read_file으로 파일 읽기를 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 파일 내용을 보여주거나 읽기 결과를 안내하면 PASS",
		);
	});

	it("should search files via search_files tool", async () => {
		await sendMessage(
			"/tmp 디렉토리에서 'cafelua-e2e' 이름의 파일을 검색해줘. search_files 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"/tmp 디렉토리에서 'cafelua-e2e' 이름의 파일을 검색해줘 (search_files)",
			"AI가 search_files으로 파일 검색을 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 검색 결과를 보여주거나 파일을 찾았다고 안내하면 PASS",
		);
	});

	it("should modify file via apply_diff tool", async () => {
		await sendMessage(
			"/tmp/cafelua-e2e-test.txt 파일에서 'hello from e2e'를 'modified by e2e'로 변경해줘. apply_diff 도구를 사용해.",
		);

		const text = await getLastAssistantMessage();
		await assertSemantic(
			text,
			"파일에서 'hello from e2e'를 'modified by e2e'로 변경해줘 (apply_diff)",
			"AI가 apply_diff으로 파일 수정을 실행했는가? '도구를 찾을 수 없다/사용할 수 없다'면 FAIL. 변경/수정을 완료했다고 안내하면 PASS",
		);
	});
});
