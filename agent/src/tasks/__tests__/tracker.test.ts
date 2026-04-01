import { describe, it, expect, beforeEach } from "vitest";
import { JobTracker } from "../tracker.js";

describe("JobTracker", () => {
	let tracker: JobTracker;

	beforeEach(() => {
		tracker = new JobTracker();
	});

	// ── Creation ────────────────────────────────────────────────────────────

	it("creates a job in pending state with kind-prefixed ID", () => {
		const id = tracker.create("skill", "skill_memo", "Save a memo");
		const job = tracker.get(id);
		expect(job).toBeDefined();
		expect(job!.status).toBe("pending");
		expect(job!.kind).toBe("skill");
		expect(job!.name).toBe("skill_memo");
		expect(id).toMatch(/^sk_[0-9a-f]{8}$/);
	});

	it("creates gateway_tool jobs with gw_ prefix", () => {
		const id = tracker.create("gateway_tool", "read_file", "Read a file");
		expect(id).toMatch(/^gw_[0-9a-f]{8}$/);
	});

	it("creates background jobs with bg_ prefix", () => {
		const id = tracker.create("background", "memory_consolidation", "Consolidate memory");
		expect(id).toMatch(/^bg_[0-9a-f]{8}$/);
	});

	// ── Lifecycle transitions ───────────────────────────────────────────────

	it("transitions pending → running → completed", () => {
		const id = tracker.create("skill", "test_skill", "Test");

		const running = tracker.start(id);
		expect(running.status).toBe("running");
		expect(running.startedAt).toBeGreaterThan(0);

		const completed = tracker.complete(id, { output: "done" });
		expect(completed.status).toBe("completed");
		expect(completed.endedAt).toBeGreaterThan(0);
		expect(completed.result).toEqual({ output: "done" });
	});

	it("transitions pending → running → failed", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		tracker.start(id);

		const failed = tracker.fail(id, "Something broke");
		expect(failed.status).toBe("failed");
		expect(failed.error).toBe("Something broke");
		expect(failed.endedAt).toBeGreaterThan(0);
	});

	it("transitions pending → killed", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		const killed = tracker.kill(id);
		expect(killed.status).toBe("killed");
	});

	it("transitions running → killed", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		tracker.start(id);
		const killed = tracker.kill(id);
		expect(killed.status).toBe("killed");
	});

	// ── Invalid transitions ─────────────────────────────────────────────────

	it("rejects invalid transition: pending → completed", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		expect(() => tracker.complete(id)).toThrow("Invalid transition: pending → completed");
	});

	it("rejects invalid transition: completed → running", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		tracker.start(id);
		tracker.complete(id);
		expect(() => tracker.start(id)).toThrow("Invalid transition: completed → running");
	});

	it("rejects transition on nonexistent job", () => {
		expect(() => tracker.start("nonexistent")).toThrow("Job not found: nonexistent");
	});

	// ── Progress ────────────────────────────────────────────────────────────

	it("reports progress on running jobs", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		tracker.start(id);

		const updated = tracker.reportProgress(id, { stepCount: 3, lastStep: "Reading files" });
		expect(updated.progress?.stepCount).toBe(3);
		expect(updated.progress?.lastStep).toBe("Reading files");
	});

	it("rejects progress on non-running jobs", () => {
		const id = tracker.create("skill", "test_skill", "Test");
		expect(() => tracker.reportProgress(id, { stepCount: 1 })).toThrow(
			'Cannot report progress on job',
		);
	});

	// ── Queries ─────────────────────────────────────────────────────────────

	it("lists all jobs", () => {
		tracker.create("skill", "a", "A");
		tracker.create("gateway_tool", "b", "B");
		expect(tracker.list()).toHaveLength(2);
	});

	it("filters by status", () => {
		const id1 = tracker.create("skill", "a", "A");
		tracker.create("skill", "b", "B");
		tracker.start(id1);

		expect(tracker.list({ status: "running" })).toHaveLength(1);
		expect(tracker.list({ status: "pending" })).toHaveLength(1);
	});

	it("filters by kind", () => {
		tracker.create("skill", "a", "A");
		tracker.create("gateway_tool", "b", "B");

		expect(tracker.list({ kind: "skill" })).toHaveLength(1);
		expect(tracker.list({ kind: "gateway_tool" })).toHaveLength(1);
	});

	// ── Eviction ────────────────────────────────────────────────────────────

	it("evicts terminal jobs older than maxAge", () => {
		const id = tracker.create("skill", "old", "Old job");
		tracker.start(id);
		tracker.complete(id);

		// Not old enough yet
		expect(tracker.evictTerminal(60_000)).toBe(0);

		// Force old timestamp
		const job = tracker.get(id)!;
		(tracker as any).jobs.set(id, { ...job, endedAt: Date.now() - 600_000 });

		expect(tracker.evictTerminal(60_000)).toBe(1);
		expect(tracker.get(id)).toBeUndefined();
	});

	it("does not evict running jobs", () => {
		const id = tracker.create("skill", "active", "Active");
		tracker.start(id);

		// Force old timestamp
		const job = tracker.get(id)!;
		(tracker as any).jobs.set(id, { ...job, createdAt: Date.now() - 600_000 });

		expect(tracker.evictTerminal(60_000)).toBe(0);
		expect(tracker.get(id)).toBeDefined();
	});

	// ── Before vs After improvement verification ────────────────────────────

	describe("improvement verification", () => {
		it("BEFORE: no way to query running skills — AFTER: list(status=running) works", () => {
			const id1 = tracker.create("skill", "skill_memo", "Save memo");
			const id2 = tracker.create("gateway_tool", "read_file", "Read file");
			tracker.start(id1);
			tracker.start(id2);

			const running = tracker.list({ status: "running" });
			expect(running).toHaveLength(2);
			expect(running.map((j) => j.name)).toContain("skill_memo");
			expect(running.map((j) => j.name)).toContain("read_file");
		});

		it("BEFORE: no execution history — AFTER: completed jobs queryable", () => {
			const id = tracker.create("skill", "skill_memo", "Save memo");
			tracker.start(id);
			tracker.complete(id, { saved: true });

			const completed = tracker.list({ status: "completed" });
			expect(completed).toHaveLength(1);
			expect(completed[0].result).toEqual({ saved: true });
			expect(completed[0].endedAt).toBeGreaterThanOrEqual(completed[0].createdAt);
		});

		it("BEFORE: fire-and-forget errors lost — AFTER: failed jobs retain error", () => {
			const id = tracker.create("skill", "skill_memo", "Save memo");
			tracker.start(id);
			tracker.fail(id, "Permission denied");

			const failed = tracker.list({ status: "failed" });
			expect(failed).toHaveLength(1);
			expect(failed[0].error).toBe("Permission denied");
		});
	});
});
