import { describe, expect, it, vi } from "vitest";

// Mock getUserMedia + Web Audio API
const mockStop = vi.fn();
const mockDisconnect = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);
let processCallback: ((e: any) => void) | null = null;

vi.stubGlobal("navigator", {
	mediaDevices: {
		getUserMedia: vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: mockStop }],
		}),
	},
	language: "ko-KR",
});

vi.stubGlobal(
	"AudioContext",
	class {
		sampleRate = 16000;
		createMediaStreamSource() {
			return { connect: vi.fn(), disconnect: mockDisconnect };
		}
		createScriptProcessor() {
			return {
				connect: vi.fn(),
				disconnect: mockDisconnect,
				set onaudioprocess(cb: (e: any) => void) {
					processCallback = cb;
				},
			};
		}
		get destination() {
			return {};
		}
		close = mockClose;
	},
);

// Import after mocks
const { startRecording } = await import("../audio-recorder");

describe("audio-recorder", () => {
	it("starts recording and returns a stop function", async () => {
		const recorder = await startRecording();
		expect(recorder.stop).toBeDefined();
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: true,
		});
	});

	it("stop returns a WAV blob", async () => {
		const recorder = await startRecording();

		// Simulate audio data via ScriptProcessorNode callback
		if (processCallback) {
			processCallback({
				inputBuffer: {
					getChannelData: () => new Float32Array([0.1, 0.2, -0.3, 0.4]),
				},
			});
		}

		const blob = await recorder.stop();
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("audio/wav");
		expect(blob.size).toBeGreaterThan(44); // WAV header + data
		expect(mockStop).toHaveBeenCalled(); // media track stopped
		expect(mockClose).toHaveBeenCalled(); // AudioContext closed
	});
});
