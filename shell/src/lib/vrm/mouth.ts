import type { VRM } from "@pixiv/three-vrm";
import { Logger } from "../logger";

type LipKey = "A" | "E" | "I" | "O" | "U";

const BLENDSHAPE_MAP: Record<LipKey, string> = {
	A: "aa",
	E: "ee",
	I: "ih",
	O: "oh",
	U: "ou",
};

const LIP_KEYS: LipKey[] = ["A", "E", "I", "O", "U"];

const ATTACK = 50;
const RELEASE = 30;
const CAP = 0.7;
const SILENCE_VOL = 0.04;
const IDLE_MS = 160;

export function createMouthController(vrm: VRM) {
	const smoothState: Record<LipKey, number> = {
		A: 0,
		E: 0,
		I: 0,
		O: 0,
		U: 0,
	};
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let currentSource: AudioBufferSourceNode | null = null;
	let lastActiveAt = 0;
	let isSpeaking = false;

	function ensureAudioContext(): AudioContext {
		if (!audioContext) {
			audioContext = new AudioContext();
		}
		return audioContext;
	}

	async function playAudio(base64Audio: string): Promise<void> {
		try {
			const ctx = ensureAudioContext();

			// Decode base64 to ArrayBuffer
			const binary = atob(base64Audio);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}

			const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
			const source = ctx.createBufferSource();
			source.buffer = audioBuffer;

			// Create analyser for volume-based lip sync
			analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			analyser.connect(ctx.destination);

			source.onended = () => {
				isSpeaking = false;
				currentSource = null;
			};

			currentSource = source;
			isSpeaking = true;
			source.start();
		} catch (err) {
			Logger.warn("MouthController", "Failed to play audio", {
				error: String(err),
			});
			isSpeaking = false;
		}
	}

	function update(delta: number): void {
		if (!vrm.expressionManager) return;

		// Compute volume from analyser
		let volume = 0;
		if (analyser && isSpeaking) {
			const data = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(data);
			let sum = 0;
			for (let i = 0; i < data.length; i++) {
				sum += data[i];
			}
			volume = sum / data.length / 255;
		}

		const amp = Math.min(volume * 0.9, 1) ** 0.7;

		// Simple vowel estimation from volume (without wlipsync MFCC)
		// This is a simplified approach: map volume to primarily "aa" shape
		const now = performance.now();
		let silent = amp < SILENCE_VOL;
		if (!silent) lastActiveAt = now;
		if (now - lastActiveAt > IDLE_MS) silent = true;

		const target: Record<LipKey, number> = {
			A: 0,
			E: 0,
			I: 0,
			O: 0,
			U: 0,
		};
		if (!silent) {
			// Volume-driven: primarily "A" shape with some variation
			target.A = Math.min(CAP, amp * 1.2);
			target.O = Math.min(CAP * 0.3, amp * 0.4);
		}

		for (const key of LIP_KEYS) {
			const from = smoothState[key];
			const to = target[key];
			const rate = 1 - Math.exp(-(to > from ? ATTACK : RELEASE) * delta);
			smoothState[key] = from + (to - from) * rate;
			const weight = (smoothState[key] <= 0.01 ? 0 : smoothState[key]) * 0.7;
			vrm.expressionManager.setValue(BLENDSHAPE_MAP[key], weight);
		}
	}

	function stop(): void {
		if (currentSource) {
			try {
				currentSource.stop();
			} catch {
				// already stopped
			}
			currentSource = null;
		}
		isSpeaking = false;
	}

	return {
		playAudio,
		update,
		stop,
		get isSpeaking() {
			return isSpeaking;
		},
	};
}
