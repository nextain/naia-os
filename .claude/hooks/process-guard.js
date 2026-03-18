#!/usr/bin/env node
/**
 * Process Guard Hook (Stop)
 *
 * Detects "declaration without action" — when an AI response contains a
 * review-completion claim (e.g., "클린 패스", "수정 없음", "clean pass") but
 * performed no file-reading tool calls (Read, Grep, Glob).
 *
 * Inspired by the open-swe ensure_no_empty_msg pattern:
 * https://github.com/langchain-ai/open-swe
 *
 * On detection: returns decision:"block" so Claude must actually read files.
 * stop_hook_active check prevents infinite loop.
 *
 * Input:  { session_id, transcript_path, cwd, stop_hook_active }
 * Output: { decision: "block", reason: "..." }  (or nothing to allow)
 */

const fs = require("fs");

// Review-completion claim patterns (Korean + English)
// Ordered from most specific to most general to reduce false positives.
const REVIEW_PASS_PATTERNS = [
	/클린\s*패스/,
	/clean\s+pass/i,
	/수정\s*(사항)?[이가]?\s*없(음|습니다|어요|네요)/,
	/변경\s*(사항)?[이가]?\s*없(음|습니다|어요|네요)/,
	/[0-9]+차\s*(?:리뷰|패스)[:\s]*(?:없|수정|클린|통과|pass|clean)/i,
	/no\s+changes?\s+found/i,
	/found\s+no\s+(issues?|changes?|problems?)/i,
	/이상\s*없(음|습니다|어요|네요)/,
	/연속\s*[0-9]+\s*회.*클린/,
	/consecutive\s+clean/i,
	/두\s*번?\s*(?:연속|째).*(?:클린|수정\s*없|없음)/,
	/리뷰\s*완료.*(?:없|통과|클린)/,
];

// File-reading tools that constitute actual review evidence
const FILE_READ_TOOLS = new Set(["Read", "Grep", "Glob"]);

// Read the last N bytes of a file efficiently.
// Returns { tail: string, truncated: boolean } where truncated=true means
// the read started mid-file (first line may be partial).
function readTail(filePath, bytes) {
	try {
		const stat = fs.statSync(filePath);
		const size = stat.size;
		const start = Math.max(0, size - bytes);
		const buf = Buffer.alloc(Math.min(bytes, size));
		const fd = fs.openSync(filePath, "r");
		fs.readSync(fd, buf, 0, buf.length, start);
		fs.closeSync(fd);
		return { tail: buf.toString("utf8"), truncated: start > 0 };
	} catch {
		return { tail: "", truncated: false };
	}
}

// Parse JSONL tail and extract the last assistant message's text + tool names
function parseLastAssistant(jsonlTail, truncated) {
	const lines = jsonlTail.split("\n");
	// Only skip first line if we started mid-file (it may be a partial record)
	const safeLines = truncated ? lines.slice(1) : lines;

	let lastText = "";
	let lastTools = [];

	for (const line of safeLines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let obj;
		try {
			obj = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (obj.type !== "assistant") continue;

		const content = obj.message?.content;
		if (!Array.isArray(content)) continue;

		let text = "";
		const tools = [];
		for (const block of content) {
			if (!block || typeof block !== "object") continue;
			if (block.type === "text") text += block.text ?? "";
			if (block.type === "tool_use" && block.name) tools.push(block.name);
		}

		lastText = text;
		lastTools = tools;
	}

	return { text: lastText, tools: lastTools };
}

async function main() {
	let input = "";
	for await (const chunk of process.stdin) {
		input += chunk;
	}

	let data;
	try {
		data = JSON.parse(input);
	} catch {
		process.exit(0);
	}

	// Prevent infinite loop: if we already triggered once this turn, allow
	if (data.stop_hook_active) {
		process.exit(0);
	}

	const transcriptPath = data.transcript_path;
	if (!transcriptPath) {
		process.exit(0);
	}
	if (!fs.existsSync(transcriptPath)) {
		process.exit(0);
	}

	// Read the last 128KB (sufficient for 1-2 assistant messages)
	const { tail, truncated } = readTail(transcriptPath, 128 * 1024);
	if (!tail) process.exit(0);

	const { text: lastText, tools: lastTools } = parseLastAssistant(tail, truncated);
	if (!lastText) process.exit(0);

	// Check: does the response claim a review pass?
	const claimsReviewPass = REVIEW_PASS_PATTERNS.some((re) =>
		re.test(lastText),
	);
	if (!claimsReviewPass) process.exit(0);

	// Check: did it actually read any files in this response?
	const hasFileRead = lastTools.some((t) => FILE_READ_TOOLS.has(t));
	if (hasFileRead) process.exit(0);

	// Declaration without action — block and demand real file reads
	const result = {
		decision: "block",
		reason:
			"[Harness/process-guard] 리뷰 완료를 선언했지만 이 응답에서 파일을 읽지 않았습니다. " +
			"Read / Grep / Glob 도구로 대상 파일들을 직접 읽고, " +
			"발견된 내용을 근거로 다시 리뷰해 주세요. " +
			"(반복 리뷰 규칙: 연속 2회 클린 패스여야 완료입니다)",
	};

	process.stdout.write(JSON.stringify(result));
	process.exit(0);
}

main().catch(() => process.exit(0));
