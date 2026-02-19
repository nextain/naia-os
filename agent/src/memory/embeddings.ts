/**
 * Gemini text-embedding-004 API wrapper.
 *
 * Uses batchEmbedContents for efficiency (single and batch).
 * Returns 768-dimensional float vectors.
 */

/** Embedding dimension for text-embedding-004 */
export const EMBEDDING_DIMS = 768;

const EMBEDDING_MODEL = "text-embedding-004";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Embed a single text string. Returns a 768-dim float vector. */
export async function embedText(
	text: string,
	apiKey: string,
): Promise<number[]> {
	const results = await embedTexts([text], apiKey);
	if (results.length === 0) {
		throw new Error("No embedding returned from Gemini API");
	}
	return results[0];
}

/** Embed multiple texts in a single batch call. Returns one vector per text. */
export async function embedTexts(
	texts: string[],
	apiKey: string,
): Promise<number[][]> {
	if (texts.length === 0) return [];

	const url = `${BASE_URL}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;

	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			requests: texts.map((text) => ({
				model: `models/${EMBEDDING_MODEL}`,
				content: { parts: [{ text }] },
			})),
		}),
	});

	if (!res.ok) {
		throw new Error(`Gemini Embedding API error: ${res.status}`);
	}

	const data = (await res.json()) as {
		embeddings: Array<{ values: number[] }>;
	};

	if (!data.embeddings || data.embeddings.length === 0) {
		throw new Error("No embedding returned from Gemini API");
	}

	return data.embeddings.map((e) => e.values);
}
