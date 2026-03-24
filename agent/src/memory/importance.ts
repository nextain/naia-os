/**
 * Importance Scoring (Amygdala analog)
 *
 * Scores incoming information on 3 axes:
 * - Importance: goal-relevance
 * - Surprise: deviation from expectations (prediction error)
 * - Emotion: user sentiment/arousal
 *
 * Combined into a utility score for gating memory storage.
 * Based on CraniMem (2025) 3-signal utility scoring.
 */

import type { ImportanceScore, MemoryInput } from "./types.js";

// ─── Heuristic Scoring (no LLM needed) ──────────────────────────────────────

/** Keywords indicating high importance */
const IMPORTANCE_MARKERS = [
	// Directives
	"always", "never", "must", "항상", "절대", "반드시",
	// Decisions
	"decided", "decision", "chose", "결정", "선택",
	// Preferences
	"prefer", "i like", "i want", "i need", "좋아", "싫어", "원해",
	// Corrections
	"actually", "no,", "wrong", "not that", "아니", "틀렸", "그게 아니라",
	// Critical info
	"password", "secret", "key", "credential", "important", "중요",
];

/** Keywords indicating surprise/novelty */
const SURPRISE_MARKERS = [
	"unexpected", "surprising", "didn't expect", "weird", "strange", "bug",
	"이상", "놀랍", "예상", "버그", "오류",
	"actually works", "turns out", "discovered", "found out",
	"알고 보니", "발견",
];

/** Keywords indicating emotional arousal */
const EMOTION_MARKERS = {
	positive: [
		"great", "perfect", "awesome", "love", "amazing", "thank",
		"완벽", "최고", "감사", "대박",
	],
	negative: [
		"frustrated", "annoying", "hate", "terrible", "ugh", "damn",
		"짜증", "별로", "최악", "답답",
	],
};

/**
 * Score importance using keyword heuristics.
 * Fast, no LLM call needed. Suitable for real-time scoring.
 */
export function scoreImportance(input: MemoryInput): ImportanceScore {
	const text = input.content.toLowerCase();

	// Importance: keyword match + role weight
	let importanceHits = 0;
	for (const marker of IMPORTANCE_MARKERS) {
		if (text.includes(marker)) importanceHits++;
	}
	// User messages inherently more important than assistant/tool
	const roleWeight = input.role === "user" ? 0.3 : input.role === "assistant" ? 0.1 : 0.0;
	const importance = Math.min(1.0, roleWeight + importanceHits * 0.15);

	// Surprise: prediction error signals
	let surpriseHits = 0;
	for (const marker of SURPRISE_MARKERS) {
		if (text.includes(marker)) surpriseHits++;
	}
	const surprise = Math.min(1.0, surpriseHits * 0.2);

	// Emotion: positive and negative markers
	let positiveHits = 0;
	let negativeHits = 0;
	for (const marker of EMOTION_MARKERS.positive) {
		if (text.includes(marker)) positiveHits++;
	}
	for (const marker of EMOTION_MARKERS.negative) {
		if (text.includes(marker)) negativeHits++;
	}
	// Map to 0.0–1.0 where 0.5 = neutral
	const emotionRaw = (positiveHits - negativeHits) * 0.15;
	const emotion = Math.min(1.0, Math.max(0.0, 0.5 + emotionRaw));
	// Emotional arousal (distance from neutral) boosts utility
	const arousal = Math.abs(emotion - 0.5) * 2; // 0.0–1.0

	// Combined utility: weighted average with arousal boost
	const utility = Math.min(
		1.0,
		importance * 0.5 + surprise * 0.2 + arousal * 0.3,
	);

	return { importance, surprise, emotion, utility };
}

/** Minimum utility threshold for storing a memory (gating) */
export const STORAGE_GATE_THRESHOLD = 0.15;

/**
 * Determine if an input is worth storing as a memory.
 * Below the gate threshold, the input is considered noise.
 */
export function shouldStore(score: ImportanceScore): boolean {
	return score.utility >= STORAGE_GATE_THRESHOLD;
}
