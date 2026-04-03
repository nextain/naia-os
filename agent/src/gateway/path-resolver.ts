import { homedir } from "node:os";
import { join } from "node:path";
import type { PathResolver } from "./types.js";

/**
 * Default resolver — returns ~/.naia/ paths.
 */
export class DefaultPathResolver implements PathResolver {
	deviceIdentityPath(): string {
		return join(homedir(), ".naia", "identity", "device.json");
	}

	configCandidates(): string[] {
		return [
			join(homedir(), ".naia", "gateway.json"),
			join(homedir(), ".naia", "openclaw", "openclaw.json"),
		];
	}
}

/** Singleton for the default resolver. Consumers import this. */
export const defaultPathResolver: PathResolver = new DefaultPathResolver();
