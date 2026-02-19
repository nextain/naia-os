import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CronStore } from "../store.js";

describe("CronStore", () => {
	let tmpDir: string;
	let storePath: string;
	let store: CronStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-store-"));
		storePath = path.join(tmpDir, "cron-jobs.json");
		store = new CronStore(storePath);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("starts with empty job list", () => {
		expect(store.list()).toEqual([]);
	});

	it("adds a cron job and retrieves it", () => {
		const job = store.add({
			label: "테스트 알림",
			task: "테스트 메시지 보내기",
			schedule: { type: "at", date: "2026-02-20T09:00:00+09:00" },
		});

		expect(job.id).toBeDefined();
		expect(job.label).toBe("테스트 알림");
		expect(job.enabled).toBe(true);
		expect(store.list()).toHaveLength(1);
	});

	it("persists jobs to JSON file", () => {
		store.add({
			label: "persist test",
			task: "do something",
			schedule: { type: "every", intervalMs: 5000 },
		});

		// Create new store from same file
		const store2 = new CronStore(storePath);
		expect(store2.list()).toHaveLength(1);
		expect(store2.list()[0].label).toBe("persist test");
	});

	it("prevents duplicate IDs", () => {
		const job = store.add({
			label: "first",
			task: "task1",
			schedule: { type: "at", date: "2026-03-01T00:00:00Z" },
		});

		// Adding with same ID should throw
		expect(() =>
			store.add({
				id: job.id,
				label: "duplicate",
				task: "task2",
				schedule: { type: "at", date: "2026-03-01T00:00:00Z" },
			}),
		).toThrow(/duplicate/i);
	});

	it("removes a job by ID", () => {
		const job = store.add({
			label: "to remove",
			task: "bye",
			schedule: { type: "every", intervalMs: 1000 },
		});

		expect(store.remove(job.id)).toBe(true);
		expect(store.list()).toHaveLength(0);
		expect(store.remove("nonexistent")).toBe(false);
	});

	it("updates a job", () => {
		const job = store.add({
			label: "original",
			task: "original task",
			schedule: { type: "every", intervalMs: 1000 },
		});

		store.update(job.id, { enabled: false, label: "updated" });

		const updated = store.get(job.id);
		expect(updated?.enabled).toBe(false);
		expect(updated?.label).toBe("updated");
	});

	it("returns undefined for non-existent get", () => {
		expect(store.get("nonexistent")).toBeUndefined();
	});

	it("handles cron expression schedule type", () => {
		const job = store.add({
			label: "daily weather",
			task: "날씨 알려줘",
			schedule: { type: "cron", expression: "0 9 * * *" },
		});

		expect(job.schedule).toEqual({
			type: "cron",
			expression: "0 9 * * *",
		});
	});
});
