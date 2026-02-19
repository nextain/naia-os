import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronStore } from "../store.js";
import type { CronJob, CronPayload } from "../types.js";

// Use fake timers for scheduler tests
describe("CronScheduler", () => {
	let CronScheduler: typeof import("../scheduler.js").CronScheduler;
	let scheduler: InstanceType<typeof CronScheduler>;
	const firedPayloads: CronPayload[] = [];

	beforeEach(async () => {
		vi.useFakeTimers();
		firedPayloads.length = 0;
		const mod = await import("../scheduler.js");
		CronScheduler = mod.CronScheduler;
		scheduler = new CronScheduler((payload) => {
			firedPayloads.push(payload);
		});
	});

	afterEach(() => {
		scheduler.stopAll();
		vi.useRealTimers();
	});

	it("fires a one-shot 'at' job at the specified time", () => {
		const now = new Date("2026-02-19T12:00:00Z");
		vi.setSystemTime(now);

		const job: CronJob = {
			id: "job-1",
			label: "one-shot test",
			task: "테스트 알림",
			schedule: {
				type: "at",
				date: "2026-02-19T12:00:05Z", // 5 seconds from now
			},
			enabled: true,
			createdAt: now.toISOString(),
		};

		scheduler.start(job);

		// Advance 4 seconds — should not fire
		vi.advanceTimersByTime(4000);
		expect(firedPayloads).toHaveLength(0);

		// Advance 1 more second — should fire
		vi.advanceTimersByTime(1000);
		expect(firedPayloads).toHaveLength(1);
		expect(firedPayloads[0].jobId).toBe("job-1");
		expect(firedPayloads[0].task).toBe("테스트 알림");
	});

	it("fires an 'every' interval job repeatedly", () => {
		vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

		const job: CronJob = {
			id: "job-2",
			label: "interval test",
			task: "반복 작업",
			schedule: { type: "every", intervalMs: 3000 },
			enabled: true,
			createdAt: "2026-02-19T12:00:00Z",
		};

		scheduler.start(job);

		vi.advanceTimersByTime(3000);
		expect(firedPayloads).toHaveLength(1);

		vi.advanceTimersByTime(3000);
		expect(firedPayloads).toHaveLength(2);

		vi.advanceTimersByTime(3000);
		expect(firedPayloads).toHaveLength(3);
	});

	it("stops a running job", () => {
		vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

		const job: CronJob = {
			id: "job-3",
			label: "stop test",
			task: "stop me",
			schedule: { type: "every", intervalMs: 1000 },
			enabled: true,
			createdAt: "2026-02-19T12:00:00Z",
		};

		scheduler.start(job);
		vi.advanceTimersByTime(2000);
		expect(firedPayloads).toHaveLength(2);

		scheduler.stop("job-3");
		vi.advanceTimersByTime(3000);
		// Should not fire after stop
		expect(firedPayloads).toHaveLength(2);
	});

	it("does not fire disabled jobs", () => {
		vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

		const job: CronJob = {
			id: "job-disabled",
			label: "disabled",
			task: "should not run",
			schedule: { type: "every", intervalMs: 1000 },
			enabled: false,
			createdAt: "2026-02-19T12:00:00Z",
		};

		scheduler.start(job);
		vi.advanceTimersByTime(5000);
		expect(firedPayloads).toHaveLength(0);
	});

	it("skips 'at' jobs scheduled in the past", () => {
		vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

		const job: CronJob = {
			id: "job-past",
			label: "past job",
			task: "old task",
			schedule: {
				type: "at",
				date: "2026-02-19T11:00:00Z", // 1 hour in the past
			},
			enabled: true,
			createdAt: "2026-02-19T10:00:00Z",
		};

		scheduler.start(job);
		vi.advanceTimersByTime(10000);
		// Should not fire — schedule is in the past
		expect(firedPayloads).toHaveLength(0);
	});

	it("parses cron expressions and fires at correct times", () => {
		// Set to 2026-02-19 08:59:00 UTC
		vi.setSystemTime(new Date("2026-02-19T08:59:00Z"));

		const job: CronJob = {
			id: "job-cron",
			label: "cron test",
			task: "매일 아침",
			schedule: { type: "cron", expression: "0 9 * * *" }, // Every day at 09:00
			enabled: true,
			createdAt: "2026-02-19T08:00:00Z",
		};

		scheduler.start(job);

		// Advance 60 seconds to 09:00:00
		vi.advanceTimersByTime(60_000);
		expect(firedPayloads).toHaveLength(1);
		expect(firedPayloads[0].task).toBe("매일 아침");
	});

	it("stopAll clears all running timers", () => {
		vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

		scheduler.start({
			id: "a",
			label: "a",
			task: "a",
			schedule: { type: "every", intervalMs: 1000 },
			enabled: true,
			createdAt: "2026-02-19T12:00:00Z",
		});
		scheduler.start({
			id: "b",
			label: "b",
			task: "b",
			schedule: { type: "every", intervalMs: 2000 },
			enabled: true,
			createdAt: "2026-02-19T12:00:00Z",
		});

		scheduler.stopAll();
		vi.advanceTimersByTime(10000);
		expect(firedPayloads).toHaveLength(0);
	});

	describe("restoreFromStore", () => {
		let tmpDir: string;
		let storePath: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sched-restore-"));
			storePath = path.join(tmpDir, "cron-jobs.json");
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("starts all enabled jobs from store", () => {
			vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

			const store = new CronStore(storePath);
			store.add({
				id: "enabled-1",
				label: "enabled job",
				task: "do stuff",
				schedule: { type: "every", intervalMs: 1000 },
			});
			store.add({
				id: "disabled-1",
				label: "disabled job",
				task: "skip me",
				schedule: { type: "every", intervalMs: 1000 },
			});
			store.update("disabled-1", { enabled: false });

			scheduler.restoreFromStore(store);

			vi.advanceTimersByTime(3000);
			// Only the enabled job should fire
			expect(firedPayloads).toHaveLength(3);
			expect(firedPayloads.every((p) => p.jobId === "enabled-1")).toBe(true);
		});

		it("does not start jobs that are already running", () => {
			vi.setSystemTime(new Date("2026-02-19T12:00:00Z"));

			const store = new CronStore(storePath);
			store.add({
				id: "already-running",
				label: "running",
				task: "task",
				schedule: { type: "every", intervalMs: 1000 },
			});

			// Start manually first
			const job = store.get("already-running")!;
			scheduler.start(job);

			vi.advanceTimersByTime(1000);
			expect(firedPayloads).toHaveLength(1);

			// Restore should not double-start
			scheduler.restoreFromStore(store);

			vi.advanceTimersByTime(1000);
			// Should still fire once per interval, not doubled
			expect(firedPayloads).toHaveLength(2);
		});
	});
});
