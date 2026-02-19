import {
	convertTts,
	disableTts,
	enableTts,
	getTtsProviders,
	getTtsStatus,
	setTtsProvider,
	type TtsProvider,
} from "../../gateway/tts-proxy.js";
import type { SkillDefinition, SkillResult } from "../types.js";

export function createTtsSkill(): SkillDefinition {
	return {
		name: "skill_tts",
		description:
			"Manage Gateway TTS (Text-to-Speech). Actions: status, providers, set_provider, enable, disable, convert.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"Action: status, providers, set_provider, enable, disable, convert",
					enum: [
						"status",
						"providers",
						"set_provider",
						"enable",
						"disable",
						"convert",
					],
				},
				provider: {
					type: "string",
					description:
						"TTS provider (openai, elevenlabs, edge). Required for set_provider.",
				},
				text: {
					type: "string",
					description: "Text to convert. Required for convert.",
				},
				voice: {
					type: "string",
					description: "Voice name (optional, for convert).",
				},
			},
			required: ["action"],
		},
		tier: 0,
		requiresGateway: true,
		source: "built-in",
		execute: async (args, ctx): Promise<SkillResult> => {
			const action = args.action as string;
			const gateway = ctx.gateway;

			if (!gateway?.isConnected()) {
				return {
					success: false,
					output: "",
					error: "Gateway not connected. TTS management requires a running Gateway.",
				};
			}

			switch (action) {
				case "status": {
					const result = await getTtsStatus(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "providers": {
					const result = await getTtsProviders(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "set_provider": {
					const provider = args.provider as string;
					if (!provider) {
						return {
							success: false,
							output: "",
							error: "provider is required for set_provider action",
						};
					}
					const result = await setTtsProvider(
						gateway,
						provider as TtsProvider,
					);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "enable": {
					const result = await enableTts(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "disable": {
					const result = await disableTts(gateway);
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				case "convert": {
					const text = args.text as string;
					if (!text) {
						return {
							success: false,
							output: "",
							error: "text is required for convert action",
						};
					}
					const result = await convertTts(gateway, text, {
						voice: args.voice as string | undefined,
					});
					return {
						success: true,
						output: JSON.stringify(result),
					};
				}

				default:
					return {
						success: false,
						output: "",
						error: `Unknown action: ${action}`,
					};
			}
		},
	};
}
