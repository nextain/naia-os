export interface AvatarPreset {
	path: string;
	label: string;
	previewImage?: string;
}

export const DEFAULT_AVATAR_MODEL = "/avatars/01-Sendagaya-Shino-uniform.vrm";

export const AVATAR_PRESETS: AvatarPreset[] = [
	{
		path: "/avatars/01-Sendagaya-Shino-uniform.vrm",
		label: "Shino",
		previewImage: "/avatars/01-Sendagaya-Shino-uniform.webp",
	},
	{
		path: "/avatars/02-Sakurada-Fumiriya.vrm",
		label: "Sakurada Fumiriya",
		previewImage: "/avatars/02-Sakurada-Fumiriya.webp",
	},
	{
		path: "/avatars/03-OL_Woman.vrm",
		label: "Girl",
		previewImage: "/avatars/03-OL_Woman.webp",
	},
	{
		path: "/avatars/04-Hood_Boy.vrm",
		label: "Boy",
		previewImage: "/avatars/04-Hood_Boy.webp",
	},
];
