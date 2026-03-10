/**
 * Sequential audio playback queue for pipeline voice.
 *
 * Queues MP3 base64 chunks and plays them in order.
 * Supports interrupt (clear all) and avatar speaking state.
 */

import { Logger } from "../logger";

export interface AudioQueueCallbacks {
	onPlaybackStart?: () => void;
	onPlaybackEnd?: () => void;
}

export class AudioQueue {
	private queue: string[] = [];
	private current: HTMLAudioElement | null = null;
	private playing = false;
	private callbacks: AudioQueueCallbacks;

	constructor(callbacks: AudioQueueCallbacks = {}) {
		this.callbacks = callbacks;
	}

	/** Add MP3 base64 audio to the queue. Starts playback if idle. */
	enqueue(mp3Base64: string): void {
		this.queue.push(mp3Base64);
		if (!this.playing) {
			this.playNext();
		}
	}

	/** Stop current playback and clear all queued audio. */
	clear(): void {
		this.queue = [];
		if (this.current) {
			this.current.pause();
			this.current.src = "";
			this.current = null;
		}
		if (this.playing) {
			this.playing = false;
			this.callbacks.onPlaybackEnd?.();
		}
	}

	/** Whether audio is currently playing or queued. */
	get isActive(): boolean {
		return this.playing || this.queue.length > 0;
	}

	/** Destroy the queue and release resources. */
	destroy(): void {
		this.clear();
	}

	private playNext(): void {
		if (this.queue.length === 0) {
			this.playing = false;
			this.callbacks.onPlaybackEnd?.();
			return;
		}

		const mp3Base64 = this.queue.shift()!;
		const wasPlaying = this.playing;
		this.playing = true;

		const audio = new Audio(`data:audio/mp3;base64,${mp3Base64}`);
		this.current = audio;

		audio.onplay = () => {
			// Only fire onPlaybackStart for the first chunk in a sequence
			if (!wasPlaying) {
				this.callbacks.onPlaybackStart?.();
			}
		};

		audio.onended = () => {
			this.current = null;
			this.playNext();
		};

		audio.onerror = (e) => {
			Logger.warn("AudioQueue", "Audio playback error", { error: String(e) });
			this.current = null;
			this.playNext();
		};

		audio.play().catch((err) => {
			Logger.warn("AudioQueue", "Audio play rejected", { error: String(err) });
			this.current = null;
			this.playNext();
		});
	}
}
