// ── Job ID Generation ────────────────────────────────────────────────────────
// Format: {kind_prefix}{8 random hex chars}
// Example: "sk_a1b2c3d4" (skill), "gw_e5f6a7b8" (gateway_tool), "bg_c9d0e1f2" (background)

import { randomBytes } from "node:crypto";
import type { JobKind } from "./types.js";

const KIND_PREFIX: Record<JobKind, string> = {
	skill: "sk_",
	gateway_tool: "gw_",
	background: "bg_",
};

/** Generate a unique job ID with kind-specific prefix. */
export function makeJobId(kind: JobKind): string {
	return KIND_PREFIX[kind] + randomBytes(4).toString("hex");
}
