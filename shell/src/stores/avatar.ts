import { create } from "zustand";
import type { EmotionName } from "../lib/vrm/expression";

interface AvatarState {
	modelPath: string;
	animationPath: string;
	isLoaded: boolean;
	loadProgress: number;
	currentEmotion: EmotionName;
	isSpeaking: boolean;
	pendingAudio: string | null;
	setLoaded: (loaded: boolean) => void;
	setLoadProgress: (progress: number) => void;
	setEmotion: (emotion: EmotionName) => void;
	setSpeaking: (speaking: boolean) => void;
	setPendingAudio: (data: string | null) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
	modelPath: "/avatars/Sendagaya-Shino-dark-uniform.vrm",
	animationPath: "/animations/idle_loop.vrma",
	isLoaded: false,
	loadProgress: 0,
	currentEmotion: "neutral",
	isSpeaking: false,
	pendingAudio: null,
	setLoaded: (loaded) => set({ isLoaded: loaded }),
	setLoadProgress: (progress) => set({ loadProgress: progress }),
	setEmotion: (emotion) => set({ currentEmotion: emotion }),
	setSpeaking: (speaking) => set({ isSpeaking: speaking }),
	setPendingAudio: (data) => set({ pendingAudio: data }),
}));
