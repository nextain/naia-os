import { describe, expect, it, vi } from "vitest";
import { createMouthController } from "../mouth";

function createMockVrm() {
	const values = new Map<string, number>();
	return {
		expressionManager: {
			setValue: (name: string, value: number) => {
				values.set(name, value);
			},
			getValue: (name: string) => values.get(name) ?? 0,
		},
		_values: values,
	};
}

describe("createMouthController", () => {
	it("creates controller with playAudio and update", () => {
		const vrm = createMockVrm();
		const ctrl = createMouthController(vrm as any);
		expect(ctrl.playAudio).toBeDefined();
		expect(ctrl.update).toBeDefined();
	});

	it("all mouth blendshapes are 0 when not speaking", () => {
		const vrm = createMockVrm();
		const ctrl = createMouthController(vrm as any);
		ctrl.update(0.016);
		// No audio playing, all mouth shapes should be 0
		expect(vrm._values.get("aa") ?? 0).toBe(0);
		expect(vrm._values.get("ee") ?? 0).toBe(0);
		expect(vrm._values.get("ih") ?? 0).toBe(0);
		expect(vrm._values.get("oh") ?? 0).toBe(0);
		expect(vrm._values.get("ou") ?? 0).toBe(0);
	});
});
