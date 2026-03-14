/**
 * GCP Service Account authentication — generates access tokens
 * from a service account JSON key without external dependencies.
 *
 * Used by Google Cloud TTS and STT when API key is a path to
 * a service account JSON file or the JSON content itself.
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an access token from a GCP service account key.
 * @param keyOrPath - Either a JSON string, a file path to .json, or an API key string.
 *                    If it looks like an API key (no braces/path), returns null.
 * @param scopes - OAuth2 scopes to request.
 */
export async function getGcpAccessToken(
	keyOrPath: string,
	scopes = "https://www.googleapis.com/auth/cloud-platform",
): Promise<string | null> {
	// If it looks like a plain API key (no { and no .json), return null
	if (!keyOrPath.includes("{") && !keyOrPath.endsWith(".json")) {
		return null;
	}

	// Return cached token if still valid
	if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
		return cachedToken.token;
	}

	let key: ServiceAccountKey;
	try {
		if (keyOrPath.endsWith(".json")) {
			key = JSON.parse(readFileSync(keyOrPath, "utf-8"));
		} else {
			key = JSON.parse(keyOrPath);
		}
	} catch {
		return null;
	}

	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(JSON.stringify({
		iss: key.client_email,
		scope: scopes,
		aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
		iat: now,
		exp: now + 3600,
	})).toString("base64url");

	const sign = createSign("RSA-SHA256");
	sign.update(`${header}.${payload}`);
	const signature = sign.sign(key.private_key, "base64url");

	const jwt = `${header}.${payload}.${signature}`;

	const resp = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
	});

	if (!resp.ok) {
		console.error("[gcp-auth] token exchange failed:", resp.status, await resp.text().catch(() => ""));
		return null;
	}

	const data = await resp.json() as { access_token: string; expires_in: number };
	cachedToken = {
		token: data.access_token,
		expiresAt: Date.now() + data.expires_in * 1000,
	};
	return data.access_token;
}
