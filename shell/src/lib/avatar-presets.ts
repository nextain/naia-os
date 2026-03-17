export interface AvatarPreset {
	path: string;
	label: string;
	previewImage?: string;
}

export const DEFAULT_AVATAR_MODEL = "/avatars/01-Sendagaya-Shino-uniform.vrm";

export type AvatarGender = "female" | "male";

export const AVATAR_PRESETS: (AvatarPreset & { gender: AvatarGender })[] = [
	{
		path: "/avatars/01-Sendagaya-Shino-uniform.vrm",
		label: "Shino",
		previewImage: "/avatars/01-Sendagaya-Shino-uniform.webp",
		gender: "female",
	},
	{
		path: "/avatars/02-Sakurada-Fumiriya.vrm",
		label: "Sakurada Fumiriya",
		previewImage: "/avatars/02-Sakurada-Fumiriya.webp",
		gender: "male",
	},
	{
		path: "/avatars/03-OL_Woman.vrm",
		label: "Girl",
		previewImage: "/avatars/03-OL_Woman.webp",
		gender: "female",
	},
	{
		path: "/avatars/04-Hood_Boy.vrm",
		label: "Boy",
		previewImage: "/avatars/04-Hood_Boy.webp",
		gender: "male",
	},
];

const VOICE_DEFAULTS: Record<AvatarGender, string> = {
	female: "Kore",
	male: "Puck",
};

/** Default TTS voices per provider, keyed by gender. */
const TTS_VOICE_DEFAULTS: Record<string, Record<AvatarGender, string>> = {
	edge: { female: "ko-KR-SunHiNeural", male: "ko-KR-InJoonNeural" },
	google: { female: "ko-KR-Neural2-A", male: "ko-KR-Neural2-C" },
};

/** Resolves the VRM avatar's gender from its path. */
export function getAvatarGender(vrmPath?: string): AvatarGender {
	const resolved = vrmPath || DEFAULT_AVATAR_MODEL;
	const preset = AVATAR_PRESETS.find((p) =>
		resolved.endsWith(p.path.replace(/^\//, "")),
	);
	return preset?.gender ?? "female";
}

/** Returns the default live voice based on the VRM avatar's gender. */
export function getDefaultVoiceForAvatar(vrmPath?: string): string {
	return VOICE_DEFAULTS[getAvatarGender(vrmPath)];
}

/** Returns the default TTS voice for a given provider based on the VRM avatar's gender. */
export function getDefaultTtsVoiceForAvatar(
	provider: string,
	vrmPath?: string,
): string {
	const gender = getAvatarGender(vrmPath);
	return (
		TTS_VOICE_DEFAULTS[provider]?.[gender] ?? TTS_VOICE_DEFAULTS.edge[gender]
	);
}
