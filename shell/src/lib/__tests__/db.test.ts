import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri invoke
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("db (facts-only)", () => {
	beforeEach(() => {
		mockInvoke.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("getAllFacts calls Tauri backend", async () => {
		const facts = [
			{
				id: "f1",
				key: "user_name",
				value: "Luke",
				source_session: null,
				created_at: 1000,
				updated_at: 1000,
			},
		];
		mockInvoke.mockResolvedValueOnce(facts);

		const { getAllFacts } = await import("../db");
		const result = await getAllFacts();

		expect(mockInvoke).toHaveBeenCalledWith("memory_get_all_facts");
		expect(result).toEqual(facts);
	});

	it("upsertFact calls Tauri with correct args", async () => {
		const fact = {
			id: "f1",
			key: "user_name",
			value: "Luke",
			source_session: null,
			created_at: 1000,
			updated_at: 1000,
		};

		const { upsertFact } = await import("../db");
		await upsertFact(fact);

		expect(mockInvoke).toHaveBeenCalledWith("memory_upsert_fact", { fact });
	});

	it("deleteFact calls Tauri with correct args", async () => {
		const { deleteFact } = await import("../db");
		await deleteFact("f1");

		expect(mockInvoke).toHaveBeenCalledWith("memory_delete_fact", {
			factId: "f1",
		});
	});

	it("validateApiKey calls Tauri with correct args", async () => {
		mockInvoke.mockResolvedValueOnce(true);

		const { validateApiKey } = await import("../db");
		const result = await validateApiKey("gemini", "test-key");

		expect(mockInvoke).toHaveBeenCalledWith("validate_api_key", {
			provider: "gemini",
			apiKey: "test-key",
		});
		expect(result).toBe(true);
	});
});
