// ── Job Tracker ─────────────────────────────────────────────────────────────
// In-memory registry for tracking all skill/tool executions.
// Provides lifecycle transitions with validation + query methods.

import type { JobState, JobKind, JobStatus, JobProgress } from "./types.js";
import { VALID_TRANSITIONS, isTerminal } from "./types.js";
import { makeJobId } from "./id.js";

export class JobTracker {
	private readonly jobs = new Map<string, JobState>();

	/** Create and register a new job in "pending" state. Returns the job ID. */
	create(kind: JobKind, name: string, description: string): string {
		const id = makeJobId(kind);
		const job: JobState = {
			id,
			kind,
			name,
			description,
			status: "pending",
			createdAt: Date.now(),
		};
		this.jobs.set(id, job);
		return id;
	}

	/** Transition a job to "running". */
	start(id: string): JobState {
		return this.transition(id, "running", { startedAt: Date.now() });
	}

	/** Transition a job to "completed" with optional result. */
	complete(id: string, result?: unknown): JobState {
		return this.transition(id, "completed", { endedAt: Date.now(), result });
	}

	/** Transition a job to "failed" with error message. */
	fail(id: string, error: string): JobState {
		return this.transition(id, "failed", { endedAt: Date.now(), error });
	}

	/** Transition a job to "killed". */
	kill(id: string): JobState {
		return this.transition(id, "killed", { endedAt: Date.now() });
	}

	/** Update progress info for a running job. */
	reportProgress(id: string, progress: JobProgress): JobState {
		const job = this.mustGet(id);
		if (job.status !== "running") {
			throw new Error(`Cannot report progress on job ${id} in "${job.status}" state`);
		}
		const updated: JobState = { ...job, progress };
		this.jobs.set(id, updated);
		return updated;
	}

	/** Get a job by ID. Returns undefined if not found. */
	get(id: string): JobState | undefined {
		return this.jobs.get(id);
	}

	/** List all jobs, optionally filtered by status. */
	list(filter?: { status?: JobStatus; kind?: JobKind }): JobState[] {
		let result = Array.from(this.jobs.values());
		if (filter?.status) {
			result = result.filter((j) => j.status === filter.status);
		}
		if (filter?.kind) {
			result = result.filter((j) => j.kind === filter.kind);
		}
		return result;
	}

	/** Remove completed/failed/killed jobs older than maxAge (ms). Default: 5 minutes. */
	evictTerminal(maxAge = 5 * 60 * 1000): number {
		const cutoff = Date.now() - maxAge;
		let count = 0;
		for (const [id, job] of this.jobs) {
			if (isTerminal(job.status) && (job.endedAt ?? job.createdAt) < cutoff) {
				this.jobs.delete(id);
				count++;
			}
		}
		return count;
	}

	/** Total number of tracked jobs. */
	get size(): number {
		return this.jobs.size;
	}

	// ── Private ─────────────────────────────────────────────────────────────

	private mustGet(id: string): JobState {
		const job = this.jobs.get(id);
		if (!job) throw new Error(`Job not found: ${id}`);
		return job;
	}

	private transition(id: string, to: JobStatus, extra: Partial<JobState>): JobState {
		const job = this.mustGet(id);
		const allowed = VALID_TRANSITIONS.get(job.status);
		if (!allowed?.has(to)) {
			throw new Error(`Invalid transition: ${job.status} → ${to} for job ${id}`);
		}
		const updated: JobState = { ...job, ...extra, status: to };
		this.jobs.set(id, updated);
		return updated;
	}
}
