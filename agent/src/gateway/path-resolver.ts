import { homedir } from "node:os";
import { join } from "node:path";
import type { PathResolver } from "./types.js";

/**
 * Default resolver — returns the current OpenClaw-era paths.
 * Phase 2+ will introduce a NaiaPathResolver that uses ~/.naia/ exclusively.
 */
export class DefaultPathResolver implements PathResolver {
	deviceIdentityPath(): string {
		return join(homedir(), ".openclaw", "identity", "device.json");
	}

	configCandidates(): string[] {
		return [
			join(homedir(), ".openclaw", "openclaw.json"),
			join(homedir(), ".naia", "openclaw", "openclaw.json"),
		];
	}
}

/** Singleton for the default resolver. Consumers import this. */
export const defaultPathResolver: PathResolver = new DefaultPathResolver();
