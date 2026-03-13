import { defineProvider } from "../registry";

export const nextainTtsProvider = defineProvider({
	id: "nextain",
	type: "tts",
	name: "Naia TTS",
	description: "Naia Lab gateway TTS (requires Naia account)",
	order: 2,
	capabilities: {
		requiresApiKey: false, // Uses naiaKey from login, not a separate API key
		runtime: "node",
	},
	configFields: [],
	defaultVoice: "Kore",
	listVoices: () => [
		{ id: "Kore", label: "Kore (여성, 차분)", gender: "female" },
		{ id: "Puck", label: "Puck (남성, 활발)", gender: "male" },
		{ id: "Charon", label: "Charon (남성)", gender: "male" },
		{ id: "Aoede", label: "Aoede (여성)", gender: "female" },
		{ id: "Fenrir", label: "Fenrir (남성)", gender: "male" },
		{ id: "Leda", label: "Leda (여성)", gender: "female" },
		{ id: "Orus", label: "Orus (남성)", gender: "male" },
		{ id: "Zephyr", label: "Zephyr (중성)", gender: "neutral" },
	],
});
