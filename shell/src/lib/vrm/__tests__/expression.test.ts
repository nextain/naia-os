import { describe, expect, it } from "vitest";
import { createEmotionController, parseEmotion } from "../expression";
import type { EmotionName } from "../expression";

describe("parseEmotion", () => {
	it("parses [HAPPY] tag", () => {
		const result = parseEmotion("[HAPPY] 좋아!");
		expect(result.emotion).toBe("happy");
		expect(result.cleanText).toBe("좋아!");
	});

	it("parses [SAD] tag", () => {
		const result = parseEmotion("[SAD] 슬퍼요...");
		expect(result.emotion).toBe("sad");
		expect(result.cleanText).toBe("슬퍼요...");
	});

	it("parses [ANGRY] tag", () => {
		const result = parseEmotion("[ANGRY] 화나!");
		expect(result.emotion).toBe("angry");
		expect(result.cleanText).toBe("화나!");
	});

	it("parses [SURPRISED] tag", () => {
		const result = parseEmotion("[SURPRISED] 헉!");
		expect(result.emotion).toBe("surprised");
		expect(result.cleanText).toBe("헉!");
	});

	it("parses [NEUTRAL] tag", () => {
		const result = parseEmotion("[NEUTRAL] 네, 알겠습니다.");
		expect(result.emotion).toBe("neutral");
		expect(result.cleanText).toBe("네, 알겠습니다.");
	});

	it("parses [THINK] tag", () => {
		const result = parseEmotion("[THINK] 음... 그건...");
		expect(result.emotion).toBe("think");
		expect(result.cleanText).toBe("음... 그건...");
	});

	it("defaults to neutral when no tag", () => {
		const result = parseEmotion("태그 없는 텍스트");
		expect(result.emotion).toBe("neutral");
		expect(result.cleanText).toBe("태그 없는 텍스트");
	});

	it("handles empty string", () => {
		const result = parseEmotion("");
		expect(result.emotion).toBe("neutral");
		expect(result.cleanText).toBe("");
	});
});

describe("createEmotionController", () => {
	function createMockVrm() {
		const values = new Map<string, number>();
		return {
			expressionManager: {
				expressionMap: {
					happy: {},
					sad: {},
					angry: {},
					surprised: {},
					neutral: {},
					aa: {},
					oh: {},
					ee: {},
				},
				setValue: (name: string, value: number) => {
					values.set(name, value);
				},
				getValue: (name: string) => values.get(name) ?? 0,
			},
			_values: values,
		};
	}

	it("creates controller with setEmotion and update", () => {
		const vrm = createMockVrm();
		const controller = createEmotionController(vrm as any);
		expect(controller.setEmotion).toBeDefined();
		expect(controller.update).toBeDefined();
	});

	it("setEmotion happy sets target expressions", () => {
		const vrm = createMockVrm();
		const controller = createEmotionController(vrm as any);
		controller.setEmotion("happy");
		// After setting, need update to apply
		controller.update(0.5); // enough delta for full blend
		expect(vrm._values.get("happy")).toBeGreaterThan(0);
	});

	it("update transitions expressions over time", () => {
		const vrm = createMockVrm();
		const controller = createEmotionController(vrm as any);
		controller.setEmotion("happy");

		// Small delta - partial transition
		controller.update(0.05);
		const partial = vrm._values.get("happy") ?? 0;
		expect(partial).toBeGreaterThan(0);
		expect(partial).toBeLessThan(1);

		// Large delta - complete transition
		controller.update(1.0);
		expect(vrm._values.get("happy")).toBe(1);
	});
});
