import { defineProvider } from "../registry";

export const elevenlabsTtsProvider = defineProvider({
	id: "elevenlabs",
	type: "tts",
	name: "ElevenLabs",
	description: "ElevenLabs high-quality voice synthesis",
	order: 5,
	capabilities: {
		requiresApiKey: true,
		runtime: "node",
	},
	configFields: [
		{
			key: "elevenlabsApiKey",
			label: "ElevenLabs API Key",
			type: "password",
			required: true,
			placeholder: "xi-...",
		},
	],
	defaultVoice: "Rachel",
	listVoices: () => [
		// ElevenLabs voice IDs are user-specific; these are built-in defaults
		{ id: "Rachel", label: "Rachel (Female)", gender: "female" },
		{ id: "Domi", label: "Domi (Female)", gender: "female" },
		{ id: "Bella", label: "Bella (Female)", gender: "female" },
		{ id: "Antoni", label: "Antoni (Male)", gender: "male" },
		{ id: "Elli", label: "Elli (Female)", gender: "female" },
		{ id: "Josh", label: "Josh (Male)", gender: "male" },
		{ id: "Arnold", label: "Arnold (Male)", gender: "male" },
		{ id: "Adam", label: "Adam (Male)", gender: "male" },
		{ id: "Sam", label: "Sam (Male)", gender: "male" },
	],
});
