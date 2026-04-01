// ── Tasks Module Entry Point ─────────────────────────────────────────────────
// Re-exports for clean imports: import { JobTracker } from "./tasks/index.js"

export { JobTracker } from "./tracker.js";
export { makeJobId } from "./id.js";
export type { JobState, JobKind, JobStatus, JobProgress } from "./types.js";
export { isTerminal, VALID_TRANSITIONS } from "./types.js";
