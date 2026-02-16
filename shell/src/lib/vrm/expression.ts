import type { VRM } from "@pixiv/three-vrm";

export type EmotionName =
	| "happy"
	| "sad"
	| "angry"
	| "surprised"
	| "neutral"
	| "think";

interface EmotionState {
	expression: { name: string; value: number }[];
	blendDuration: number;
}

const EMOTION_STATES: Record<EmotionName, EmotionState> = {
	happy: {
		expression: [
			{ name: "happy", value: 1.0 },
			{ name: "aa", value: 0.3 },
		],
		blendDuration: 0.3,
	},
	sad: {
		expression: [
			{ name: "sad", value: 1.0 },
			{ name: "oh", value: 0.2 },
		],
		blendDuration: 0.3,
	},
	angry: {
		expression: [
			{ name: "angry", value: 1.0 },
			{ name: "ee", value: 0.4 },
		],
		blendDuration: 0.2,
	},
	surprised: {
		expression: [
			{ name: "surprised", value: 1.0 },
			{ name: "oh", value: 0.6 },
		],
		blendDuration: 0.1,
	},
	neutral: {
		expression: [{ name: "neutral", value: 1.0 }],
		blendDuration: 0.5,
	},
	think: {
		expression: [{ name: "neutral", value: 0.6 }],
		blendDuration: 0.5,
	},
};

const EMOTION_TAG_RE = /^\[(HAPPY|SAD|ANGRY|SURPRISED|NEUTRAL|THINK)]\s*/i;

export function parseEmotion(text: string): {
	emotion: EmotionName;
	cleanText: string;
} {
	const match = text.match(EMOTION_TAG_RE);
	if (!match) {
		return { emotion: "neutral", cleanText: text };
	}
	return {
		emotion: match[1].toLowerCase() as EmotionName,
		cleanText: text.slice(match[0].length),
	};
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function createEmotionController(vrm: VRM) {
	let currentEmotion: EmotionName | null = null;
	let isTransitioning = false;
	let transitionProgress = 0;
	const currentValues = new Map<string, number>();
	const targetValues = new Map<string, number>();

	function setEmotion(name: EmotionName, intensity = 1) {
		const state = EMOTION_STATES[name];
		if (!state) return;

		currentEmotion = name;
		isTransitioning = true;
		transitionProgress = 0;
		currentValues.clear();
		targetValues.clear();

		const clamped = Math.min(1, Math.max(0, intensity));

		// Reset all expressions to 0 first
		if (vrm.expressionManager) {
			for (const exprName of Object.keys(vrm.expressionManager.expressionMap)) {
				vrm.expressionManager.setValue(exprName, 0);
			}
		}

		for (const expr of state.expression) {
			const current = vrm.expressionManager?.getValue(expr.name) ?? 0;
			currentValues.set(expr.name, current);
			targetValues.set(expr.name, expr.value * clamped);
		}
	}

	function update(delta: number) {
		if (!isTransitioning || !currentEmotion) return;

		const state = EMOTION_STATES[currentEmotion];
		const blendDuration = state.blendDuration;

		transitionProgress += delta / blendDuration;
		if (transitionProgress >= 1.0) {
			transitionProgress = 1.0;
			isTransitioning = false;
		}

		const easedT = easeInOutCubic(transitionProgress);

		for (const [exprName, target] of targetValues) {
			const start = currentValues.get(exprName) ?? 0;
			const value = start + (target - start) * easedT;
			vrm.expressionManager?.setValue(exprName, value);
		}
	}

	return { setEmotion, update };
}
