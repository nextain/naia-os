import { create } from "zustand";
import { loadConfig } from "../lib/config";
import type { EmotionName } from "../lib/vrm/expression";

const DEFAULT_VRM = "/avatars/Sendagaya-Shino-dark-uniform.vrm";

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
	setModelPath: (path: string) => void;
}

function getInitialModelPath(): string {
	const config = loadConfig();
	return config?.vrmModel || DEFAULT_VRM;
}

export const useAvatarStore = create<AvatarState>((set) => ({
	modelPath: getInitialModelPath(),
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
	setModelPath: (path) => set({ modelPath: path, isLoaded: false, loadProgress: 0 }),
}));
