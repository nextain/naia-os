/**
 * TTS provider auto-registration for the agent runtime.
 * Import this file to populate the TTS registry with all providers.
 */

import { registerTts } from "../providers/registry.js";
import { synthesizeEdgeSpeech } from "./edge-tts.js";
import { synthesizeElevenLabsSpeech } from "./elevenlabs-tts.js";
import { synthesizeSpeech } from "./google-tts.js";
import { synthesizeNextainSpeech } from "./nextain-tts.js";
import { synthesizeOpenAISpeech } from "./openai-tts.js";

registerTts("edge", ({ text, voice }) => synthesizeEdgeSpeech(text, voice));

registerTts("google", ({ text, voice, apiKey }) => {
	if (!apiKey) return Promise.resolve(null);
	return synthesizeSpeech(text, apiKey, voice);
});

registerTts("openai", ({ text, voice, apiKey }) => {
	if (!apiKey) return Promise.resolve(null);
	return synthesizeOpenAISpeech(text, apiKey, voice);
});

registerTts("elevenlabs", ({ text, voice, apiKey }) => {
	if (!apiKey) return Promise.resolve(null);
	return synthesizeElevenLabsSpeech(text, apiKey, voice);
});

registerTts("nextain", ({ text, voice, naiaKey }) => {
	if (!naiaKey) return Promise.resolve(null);
	return synthesizeNextainSpeech(text, naiaKey, voice);
});
