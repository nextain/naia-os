import { readFileSync } from "node:fs";
import { defaultPathResolver } from "./path-resolver.js";
import type { DeviceIdentity, PathResolver } from "./types.js";

/**
 * Load device identity from the path resolved by PathResolver.
 * Returns undefined if the file is missing, malformed, or incomplete.
 */
export function loadDeviceIdentity(
	resolver: PathResolver = defaultPathResolver,
): DeviceIdentity | undefined {
	const identityPath = resolver.deviceIdentityPath();
	try {
		const raw = JSON.parse(readFileSync(identityPath, "utf-8"));
		const deviceId = raw.deviceId;
		const publicKeyPem = raw.publicKeyPem;
		const privateKeyPem = raw.privateKeyPem;

		if (
			typeof deviceId !== "string" ||
			typeof publicKeyPem !== "string" ||
			typeof privateKeyPem !== "string"
		) {
			return undefined;
		}

		return { id: deviceId, publicKey: publicKeyPem, privateKeyPem };
	} catch {
		return undefined;
	}
}
