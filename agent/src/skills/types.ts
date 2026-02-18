import type { GatewayClient } from "../gateway/client.js";

/** Result from skill execution */
export interface SkillResult {
	success: boolean;
	output: string;
	error?: string;
}

/** Context passed to skill handlers */
export interface SkillExecutionContext {
	gateway?: GatewayClient;
}

/** Skill handler function */
export type SkillHandler = (
	args: Record<string, unknown>,
	ctx: SkillExecutionContext,
) => Promise<SkillResult>;

/** Full skill definition */
export interface SkillDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	execute: SkillHandler;
	tier: number;
	requiresGateway: boolean;
	source: string;
}
