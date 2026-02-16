import { describe, expect, it } from "vitest";
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
	it("creates controller with setSpeaking and update", () => {
		const vrm = createMockVrm();
		const ctrl = createMouthController(vrm as any);
		expect(ctrl.setSpeaking).toBeDefined();
		expect(ctrl.update).toBeDefined();
		expect(ctrl.stop).toBeDefined();
	});

	it("all mouth blendshapes are 0 when not speaking", () => {
		const vrm = createMockVrm();
		const ctrl = createMouthController(vrm as any);
		ctrl.update(0.016);
		expect(vrm._values.get("aa") ?? 0).toBe(0);
		expect(vrm._values.get("ee") ?? 0).toBe(0);
		expect(vrm._values.get("ih") ?? 0).toBe(0);
		expect(vrm._values.get("oh") ?? 0).toBe(0);
		expect(vrm._values.get("ou") ?? 0).toBe(0);
	});

	it("mouth opens when speaking", () => {
		const vrm = createMockVrm();
		const ctrl = createMouthController(vrm as any);

		ctrl.setSpeaking(true);
		expect(ctrl.isSpeaking).toBe(true);

		// Run several update frames to let smoothing kick in
		for (let i = 0; i < 10; i++) {
			ctrl.update(0.016);
		}

		// At least "aa" should have a non-zero value
		const aa = vrm._values.get("aa") ?? 0;
		expect(aa).toBeGreaterThan(0);
	});

	it("mouth closes after stop", () => {
		const vrm = createMockVrm();
		const ctrl = createMouthController(vrm as any);

		ctrl.setSpeaking(true);
		for (let i = 0; i < 10; i++) ctrl.update(0.016);

		ctrl.stop();
		expect(ctrl.isSpeaking).toBe(false);

		// Run several frames for smooth close
		for (let i = 0; i < 30; i++) ctrl.update(0.016);
		const aa = vrm._values.get("aa") ?? 0;
		expect(aa).toBeLessThan(0.05);
	});
});
