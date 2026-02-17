/**
 * Web Audio API-based recorder for webkit2gtk (no MediaRecorder support).
 * Captures raw PCM via ScriptProcessorNode and encodes as WAV.
 */
export interface AudioRecorder {
	stop: () => Promise<Blob>;
}

export async function startRecording(): Promise<AudioRecorder> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const ctx = new AudioContext({ sampleRate: 16000 });
	const source = ctx.createMediaStreamSource(stream);

	// ScriptProcessorNode captures raw PCM data
	const bufferSize = 4096;
	const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
	const chunks: Float32Array[] = [];

	processor.onaudioprocess = (e) => {
		const data = e.inputBuffer.getChannelData(0);
		chunks.push(new Float32Array(data));
	};

	source.connect(processor);
	processor.connect(ctx.destination);

	return {
		stop: async () => {
			processor.disconnect();
			source.disconnect();
			stream.getTracks().forEach((t) => t.stop());
			await ctx.close();

			// Merge chunks into single buffer
			const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
			const pcm = new Float32Array(totalLength);
			let offset = 0;
			for (const chunk of chunks) {
				pcm.set(chunk, offset);
				offset += chunk.length;
			}

			return encodeWav(pcm, ctx.sampleRate);
		},
	};
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);

	// WAV header
	writeString(view, 0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	writeString(view, 8, "WAVE");
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true); // chunk size
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeString(view, 36, "data");
	view.setUint32(40, samples.length * 2, true);

	// PCM data (float32 → int16)
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}
