/**
 * LLM Provider Live Verification (#60)
 *
 * 실제 API를 호출해서 각 프로바이더의 응답 흐름을 검증합니다.
 * 목적: pass/fail이 아니라 각 프로바이더의 요청→응답 흐름을 파악하고
 *       문제가 있으면 오류 내용을 통해 디버깅하는 것.
 *
 * 실행: CAFE_LIVE_LLM_E2E=1 pnpm exec vitest run src/__tests__/llm-provider-live.test.ts
 * .env: shell/.env에 API 키 필요
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProvider } from "../providers/factory.js";
import type { StreamChunk } from "../providers/types.js";

// Load shell/.env for API keys
const envPath = resolve(import.meta.dirname, "../../../shell/.env");
try {
	const envContent = readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const match = line.match(/^([^#=]+)=(.*)$/);
		if (match) {
			const key = match[1].trim();
			const rawVal = match[2].trim();
			const val = rawVal.replace(/^['"]|['"]$/g, "");
			if (!process.env[key]) process.env[key] = val;
		}
	}
} catch {
	/* shell/.env not found */
}

const SKIP = !process.env.CAFE_LIVE_LLM_E2E;

const PROVIDERS = [
	{ provider: "gemini", model: "gemini-2.5-flash", keyEnv: "GEMINI_API_KEY" },
	{ provider: "openai", model: "gpt-4o", keyEnv: "OPENAI_API_KEY" },
	{
		provider: "anthropic",
		model: "claude-haiku-4-5-20251001",
		keyEnv: "ANTHROPIC_API_KEY",
	},
	{ provider: "xai", model: "grok-3-mini", keyEnv: "XAI_API_KEY" },
	{ provider: "zai", model: "glm-4.7", keyEnv: "ZHIPU_API_KEY" },
] as const;

describe.skipIf(SKIP)("LLM Provider Live Verification", () => {
	// ── Naia Cloud (lab-proxy) — uses naiaKey, not apiKey ──
	const naiaKey = process.env.NAIA_API_KEY ?? "";

	describe.skipIf(!naiaKey)("nextain / lab-proxy (gemini-2.5-flash)", () => {
		it("should stream via gateway", async () => {
			const provider = buildProvider({
				provider: "nextain",
				model: "gemini-2.5-flash",
				apiKey: "",
				naiaKey,
			});

			const chunks: StreamChunk[] = [];
			let fullText = "";

			console.log(`\n[nextain] Sending: "Say hello in one word."`);
			console.log("[nextain] Model: gemini-2.5-flash (via lab-proxy)");
			console.log(`[nextain] NaiaKey: ${naiaKey.slice(0, 8)}...`);

			try {
				for await (const chunk of provider.stream(
					[{ role: "user", content: "Say hello in one word." }],
					"You are a helpful assistant. Reply concisely.",
					undefined,
					AbortSignal.timeout(30_000),
				)) {
					chunks.push(chunk);
					if (chunk.type === "text") fullText += chunk.text;
				}
			} catch (err) {
				console.error(`[nextain] ERROR: ${String(err)}`);
				throw err;
			}

			console.log(`[nextain] Response text: "${fullText}"`);
			console.log(
				`[nextain] Chunks: ${chunks.length} (types: ${chunks.map((c) => c.type).join(", ")})`,
			);
			const usage = chunks.find((c) => c.type === "usage");
			if (usage && usage.type === "usage") {
				console.log(
					`[nextain] Tokens: in=${usage.inputTokens} out=${usage.outputTokens}`,
				);
			}

			expect(fullText.length).toBeGreaterThan(0);
			expect(chunks.some((c) => c.type === "finish")).toBe(true);
		}, 60_000);
	});

	// ── Edge cases: provider/model mismatch ──
	describe.skipIf(!naiaKey)("nextain + claude model (mismatch)", () => {
		it("should fail with clear error (gateway lacks Anthropic key)", async () => {
			// Known behavior: lab-proxy gateway supports vertexai:gemini only.
			// Anthropic models require a separate API key not configured on the gateway.
			// This test verifies the error is explicit (not a silent empty response).
			console.log(
				"\n[nextain+claude] Testing: nextain provider with claude-sonnet-4-6",
			);
			const provider = buildProvider({
				provider: "nextain",
				model: "claude-sonnet-4-6",
				apiKey: "",
				naiaKey,
			});

			let caughtError: Error | undefined;
			const chunks: StreamChunk[] = [];

			try {
				for await (const chunk of provider.stream(
					[{ role: "user", content: "Say hello in one word." }],
					"Reply concisely.",
					undefined,
					AbortSignal.timeout(30_000),
				)) {
					chunks.push(chunk);
				}
			} catch (err) {
				caughtError = err instanceof Error ? err : new Error(String(err));
			}

			console.log(
				`[nextain+claude] Error: ${caughtError?.message ?? "(none)"}`,
			);
			console.log(
				`[nextain+claude] Chunks before error: ${chunks.map((c) => c.type).join(", ")}`,
			);

			// Must fail with an explicit error (not silently succeed with empty text)
			expect(caughtError).toBeDefined();
			expect(caughtError?.message).toContain("empty SSE stream");
		}, 60_000);
	});

	// ── API-key providers ──
	for (const p of PROVIDERS) {
		const apiKey = process.env[p.keyEnv] ?? "";

		describe.skipIf(!apiKey)(`${p.provider} (${p.model})`, () => {
			it("should stream a response", async () => {
				const provider = buildProvider({
					provider: p.provider,
					model: p.model,
					apiKey,
				});

				const chunks: StreamChunk[] = [];
				let fullText = "";

				console.log(`\n[${p.provider}] Sending: "Say hello in one word."`);
				console.log(`[${p.provider}] Model: ${p.model}`);
				console.log(`[${p.provider}] API Key: ${apiKey.slice(0, 8)}...`);

				try {
					for await (const chunk of provider.stream(
						[{ role: "user", content: "Say hello in one word." }],
						"You are a helpful assistant. Reply concisely.",
						undefined,
						AbortSignal.timeout(30_000),
					)) {
						chunks.push(chunk);

						if (chunk.type === "text") {
							fullText += chunk.text;
						}
					}
				} catch (err) {
					console.error(`[${p.provider}] ERROR: ${String(err)}`);
					throw err;
				}

				// Log the full flow
				console.log(`[${p.provider}] Response text: "${fullText}"`);
				console.log(
					`[${p.provider}] Chunks: ${chunks.length} (types: ${chunks.map((c) => c.type).join(", ")})`,
				);

				const usage = chunks.find((c) => c.type === "usage");
				if (usage && usage.type === "usage") {
					console.log(
						`[${p.provider}] Tokens: in=${usage.inputTokens} out=${usage.outputTokens}`,
					);
				}

				expect(fullText.length).toBeGreaterThan(0);
				expect(chunks.some((c) => c.type === "finish")).toBe(true);
			}, 60_000);
		});
	}
});
