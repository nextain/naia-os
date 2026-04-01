// ── Job Lifecycle Types ──────────────────────────────────────────────────────
// Tracks skill/tool executions from start to completion.
// Every execution gets a JobState — no more fire-and-forget.

/** Categories of tracked work. */
export type JobKind = "skill" | "gateway_tool" | "background";

/** Lifecycle states. Transitions: pending → running → completed|failed|killed */
export type JobStatus = "pending" | "running" | "completed" | "failed" | "killed";

/** Immutable snapshot of a tracked execution. */
export interface JobState {
	readonly id: string;
	readonly kind: JobKind;
	readonly name: string;
	readonly description: string;
	readonly status: JobStatus;
	readonly createdAt: number;
	readonly startedAt?: number;
	readonly endedAt?: number;
	readonly progress?: JobProgress;
	readonly result?: unknown;
	readonly error?: string;
}

/** Optional progress info for long-running jobs. */
export interface JobProgress {
	readonly stepCount: number;
	readonly lastStep?: string;
}

/** Valid status transitions. */
export const VALID_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>> = new Map([
	["pending", new Set<JobStatus>(["running", "killed"])],
	["running", new Set<JobStatus>(["completed", "failed", "killed"])],
	["completed", new Set<JobStatus>()],
	["failed", new Set<JobStatus>()],
	["killed", new Set<JobStatus>()],
]);

/** Check if a job is in a terminal state. */
export function isTerminal(status: JobStatus): boolean {
	return status === "completed" || status === "failed" || status === "killed";
}
