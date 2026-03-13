import { defineProvider } from "../registry";
import type { VoiceInfo } from "../types";

const EDGE_VOICES: VoiceInfo[] = [
	// 한국어
	{ id: "ko-KR-SunHiNeural", label: "SunHi (여성)", locale: "ko-KR", gender: "female" },
	{ id: "ko-KR-InJoonNeural", label: "InJoon (남성)", locale: "ko-KR", gender: "male" },
	{ id: "ko-KR-HyunsuMultilingualNeural", label: "Hyunsu (다국어)", locale: "ko-KR", gender: "male" },
	// English (US)
	{ id: "en-US-AvaNeural", label: "Ava (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-AndrewNeural", label: "Andrew (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-EmmaNeural", label: "Emma (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-BrianNeural", label: "Brian (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-AriaNeural", label: "Aria (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-AnaNeural", label: "Ana (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-ChristopherNeural", label: "Christopher (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-EricNeural", label: "Eric (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-GuyNeural", label: "Guy (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-JennyNeural", label: "Jenny (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-MichelleNeural", label: "Michelle (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-RogerNeural", label: "Roger (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-SteffanNeural", label: "Steffan (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-AndrewMultilingualNeural", label: "Andrew Multilingual (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-AvaMultilingualNeural", label: "Ava Multilingual (Female)", locale: "en-US", gender: "female" },
	{ id: "en-US-BrianMultilingualNeural", label: "Brian Multilingual (Male)", locale: "en-US", gender: "male" },
	{ id: "en-US-EmmaMultilingualNeural", label: "Emma Multilingual (Female)", locale: "en-US", gender: "female" },
	// English (GB)
	{ id: "en-GB-LibbyNeural", label: "Libby (Female)", locale: "en-GB", gender: "female" },
	{ id: "en-GB-SoniaNeural", label: "Sonia (Female)", locale: "en-GB", gender: "female" },
	{ id: "en-GB-RyanNeural", label: "Ryan (Male)", locale: "en-GB", gender: "male" },
	{ id: "en-GB-ThomasNeural", label: "Thomas (Male)", locale: "en-GB", gender: "male" },
	{ id: "en-GB-MaisieNeural", label: "Maisie (Female)", locale: "en-GB", gender: "female" },
	// English (AU)
	{ id: "en-AU-NatashaNeural", label: "Natasha (Female)", locale: "en-AU", gender: "female" },
	{ id: "en-AU-WilliamMultilingualNeural", label: "William Multilingual (Male)", locale: "en-AU", gender: "male" },
	// 日本語
	{ id: "ja-JP-NanamiNeural", label: "Nanami (女性)", locale: "ja-JP", gender: "female" },
	{ id: "ja-JP-KeitaNeural", label: "Keita (男性)", locale: "ja-JP", gender: "male" },
	// 中文
	{ id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao (女性)", locale: "zh-CN", gender: "female" },
	{ id: "zh-CN-XiaoyiNeural", label: "Xiaoyi (女性)", locale: "zh-CN", gender: "female" },
	{ id: "zh-CN-YunjianNeural", label: "Yunjian (男性)", locale: "zh-CN", gender: "male" },
	{ id: "zh-CN-YunxiNeural", label: "Yunxi (男性)", locale: "zh-CN", gender: "male" },
	{ id: "zh-CN-YunxiaNeural", label: "Yunxia (男性)", locale: "zh-CN", gender: "male" },
	{ id: "zh-CN-YunyangNeural", label: "Yunyang (男性)", locale: "zh-CN", gender: "male" },
	{ id: "zh-TW-HsiaoChenNeural", label: "HsiaoChen (女性)", locale: "zh-TW", gender: "female" },
	{ id: "zh-TW-HsiaoYuNeural", label: "HsiaoYu (女性)", locale: "zh-TW", gender: "female" },
	{ id: "zh-TW-YunJheNeural", label: "YunJhe (男性)", locale: "zh-TW", gender: "male" },
	// Français
	{ id: "fr-FR-DeniseNeural", label: "Denise (Femme)", locale: "fr-FR", gender: "female" },
	{ id: "fr-FR-HenriNeural", label: "Henri (Homme)", locale: "fr-FR", gender: "male" },
	{ id: "fr-FR-EloiseNeural", label: "Eloise (Femme)", locale: "fr-FR", gender: "female" },
	{ id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne Multilingual (Femme)", locale: "fr-FR", gender: "female" },
	{ id: "fr-FR-RemyMultilingualNeural", label: "Remy Multilingual (Homme)", locale: "fr-FR", gender: "male" },
	// Deutsch
	{ id: "de-DE-KatjaNeural", label: "Katja (Weiblich)", locale: "de-DE", gender: "female" },
	{ id: "de-DE-ConradNeural", label: "Conrad (Männlich)", locale: "de-DE", gender: "male" },
	{ id: "de-DE-AmalaNeural", label: "Amala (Weiblich)", locale: "de-DE", gender: "female" },
	{ id: "de-DE-KillianNeural", label: "Killian (Männlich)", locale: "de-DE", gender: "male" },
	{ id: "de-DE-SeraphinaMultilingualNeural", label: "Seraphina Multilingual (Weiblich)", locale: "de-DE", gender: "female" },
	{ id: "de-DE-FlorianMultilingualNeural", label: "Florian Multilingual (Männlich)", locale: "de-DE", gender: "male" },
	// Русский
	{ id: "ru-RU-SvetlanaNeural", label: "Svetlana (Женский)", locale: "ru-RU", gender: "female" },
	{ id: "ru-RU-DmitryNeural", label: "Dmitry (Мужской)", locale: "ru-RU", gender: "male" },
	// Español
	{ id: "es-ES-ElviraNeural", label: "Elvira (Femenino)", locale: "es-ES", gender: "female" },
	{ id: "es-ES-AlvaroNeural", label: "Alvaro (Masculino)", locale: "es-ES", gender: "male" },
	{ id: "es-ES-XimenaNeural", label: "Ximena (Femenino)", locale: "es-ES", gender: "female" },
	{ id: "es-MX-DaliaNeural", label: "Dalia (Femenino)", locale: "es-MX", gender: "female" },
	{ id: "es-MX-JorgeNeural", label: "Jorge (Masculino)", locale: "es-MX", gender: "male" },
	// العربية
	{ id: "ar-SA-ZariyahNeural", label: "Zariyah (أنثى)", locale: "ar-SA", gender: "female" },
	{ id: "ar-SA-HamedNeural", label: "Hamed (ذكر)", locale: "ar-SA", gender: "male" },
	{ id: "ar-EG-SalmaNeural", label: "Salma (أنثى)", locale: "ar-EG", gender: "female" },
	{ id: "ar-EG-ShakirNeural", label: "Shakir (ذكر)", locale: "ar-EG", gender: "male" },
	// हिन्दी
	{ id: "hi-IN-SwaraNeural", label: "Swara (महिला)", locale: "hi-IN", gender: "female" },
	{ id: "hi-IN-MadhurNeural", label: "Madhur (पुरुष)", locale: "hi-IN", gender: "male" },
	// বাংলা
	{ id: "bn-BD-NabanitaNeural", label: "Nabanita (মহিলা)", locale: "bn-BD", gender: "female" },
	{ id: "bn-BD-PradeepNeural", label: "Pradeep (পুরুষ)", locale: "bn-BD", gender: "male" },
	{ id: "bn-IN-TanishaaNeural", label: "Tanishaa (মহিলা)", locale: "bn-IN", gender: "female" },
	{ id: "bn-IN-BashkarNeural", label: "Bashkar (পুরুষ)", locale: "bn-IN", gender: "male" },
	// Português
	{ id: "pt-BR-FranciscaNeural", label: "Francisca (Feminino)", locale: "pt-BR", gender: "female" },
	{ id: "pt-BR-AntonioNeural", label: "Antonio (Masculino)", locale: "pt-BR", gender: "male" },
	{ id: "pt-BR-ThalitaMultilingualNeural", label: "Thalita Multilingual (Feminino)", locale: "pt-BR", gender: "female" },
	{ id: "pt-PT-RaquelNeural", label: "Raquel (Feminino)", locale: "pt-PT", gender: "female" },
	{ id: "pt-PT-DuarteNeural", label: "Duarte (Masculino)", locale: "pt-PT", gender: "male" },
	// Bahasa Indonesia
	{ id: "id-ID-GadisNeural", label: "Gadis (Perempuan)", locale: "id-ID", gender: "female" },
	{ id: "id-ID-ArdiNeural", label: "Ardi (Laki-laki)", locale: "id-ID", gender: "male" },
	// Tiếng Việt
	{ id: "vi-VN-HoaiMyNeural", label: "HoaiMy (Nữ)", locale: "vi-VN", gender: "female" },
	{ id: "vi-VN-NamMinhNeural", label: "NamMinh (Nam)", locale: "vi-VN", gender: "male" },
];

export const edgeTtsProvider = defineProvider({
	id: "edge",
	type: "tts",
	name: "Edge TTS",
	description: "Microsoft Edge neural voices (free, no API key)",
	order: 1,
	capabilities: {
		requiresApiKey: false,
		runtime: "node",
	},
	configFields: [],
	defaultVoice: "ko-KR-SunHiNeural",
	listVoices: (locale?: string) => {
		if (!locale) return EDGE_VOICES;
		const langPrefix = locale.slice(0, 2).toLowerCase() + "-";
		return EDGE_VOICES.filter(
			(v) =>
				v.id.toLowerCase().startsWith(langPrefix) ||
				v.id.includes("Multilingual"),
		);
	},
});
