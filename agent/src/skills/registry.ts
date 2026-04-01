import type { ToolCallInfo, ToolDefinition } from "../providers/types.js";
import type {
	SafetyPredicate,
	SkillDefinition,
	SkillExecutionContext,
	SkillResult,
} from "./types.js";

/** Constant predicate that always returns false (fail-closed default). */
const ALWAYS_FALSE: SafetyPredicate = () => false;

/** Safety metadata for non-skill tools (gateway built-ins). */
export interface ToolSafetyMeta {
	isConcurrencySafe?: SafetyPredicate;
	isDestructive?: SafetyPredicate;
	isReadOnly?: SafetyPredicate;
}

export class SkillRegistry {
	private skills = new Map<string, SkillDefinition>();

	/**
	 * Safety metadata for non-skill tools (e.g. gateway built-ins like
	 * execute_command, read_file, etc.) that don't go through register().
	 */
	private toolSafety = new Map<string, ToolSafetyMeta>();

	/** Register safety metadata for a non-skill tool (no skill_ prefix required). */
	registerToolSafety(name: string, meta: ToolSafetyMeta): void {
		this.toolSafety.set(name, meta);
	}

	register(skill: SkillDefinition): void {
		if (!skill.name.startsWith("skill_")) {
			throw new Error(`Skill name "${skill.name}" must have skill_ prefix`);
		}
		if (this.skills.has(skill.name)) {
			throw new Error(`Skill "${skill.name}" is already registered`);
		}
		// Normalize safety predicates — absent ⇒ fail-closed (false)
		const normalized: SkillDefinition = {
			...skill,
			isConcurrencySafe: skill.isConcurrencySafe ?? ALWAYS_FALSE,
			isDestructive: skill.isDestructive ?? ALWAYS_FALSE,
			isReadOnly: skill.isReadOnly ?? ALWAYS_FALSE,
		};
		this.skills.set(skill.name, normalized);
	}

	get(name: string): SkillDefinition | undefined {
		return this.skills.get(name);
	}

	has(name: string): boolean {
		return this.skills.has(name);
	}

	unregister(name: string): void {
		this.skills.delete(name);
	}

	list(): SkillDefinition[] {
		return [...this.skills.values()];
	}

	async execute(
		name: string,
		args: Record<string, unknown>,
		ctx: SkillExecutionContext,
	): Promise<SkillResult> {
		const skill = this.skills.get(name);
		if (!skill) {
			return {
				success: false,
				output: "",
				error: `Unknown skill: ${name}`,
			};
		}
		try {
			return await skill.execute(args, ctx);
		} catch (err) {
			return {
				success: false,
				output: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	toToolDefinitions(hasGateway: boolean): ToolDefinition[] {
		const result: ToolDefinition[] = [];
		for (const skill of this.skills.values()) {
			if (skill.requiresGateway && !hasGateway) continue;
			result.push({
				name: skill.name,
				description: skill.description,
				parameters: skill.parameters,
			});
		}
		return result;
	}

	// --- Safety metadata queries ---

	/** Resolve safety predicates for any tool (skill or non-skill). */
	private resolveSafety(name: string): ToolSafetyMeta | undefined {
		const skill = this.skills.get(name);
		if (skill) return skill;
		return this.toolSafety.get(name);
	}

	/** Is the given tool safe for concurrent execution with these args? */
	isConcurrencySafe(name: string, args: Record<string, unknown>): boolean {
		const meta = this.resolveSafety(name);
		if (!meta) return false; // unknown tool = unsafe
		return (meta.isConcurrencySafe ?? ALWAYS_FALSE)(args);
	}

	/** Does the given tool perform destructive operations with these args? Fail-closed: unknown = destructive. */
	isDestructive(name: string, args: Record<string, unknown>): boolean {
		const meta = this.resolveSafety(name);
		if (!meta) return true; // unknown tool = assume destructive (fail-closed)
		return (meta.isDestructive ?? ALWAYS_FALSE)(args);
	}

	/** Is the given tool read-only with no side effects for these args? */
	isReadOnly(name: string, args: Record<string, unknown>): boolean {
		const meta = this.resolveSafety(name);
		if (!meta) return false;
		return (meta.isReadOnly ?? ALWAYS_FALSE)(args);
	}

	/**
	 * Partition tool calls into concurrent (safe to run in parallel) and
	 * sequential (must run one-at-a-time) groups.
	 */
	partitionForConcurrentExecution(toolCalls: ToolCallInfo[]): {
		concurrent: ToolCallInfo[];
		sequential: ToolCallInfo[];
	} {
		const concurrent: ToolCallInfo[] = [];
		const sequential: ToolCallInfo[] = [];
		for (const call of toolCalls) {
			if (this.isConcurrencySafe(call.name, call.args)) {
				concurrent.push(call);
			} else {
				sequential.push(call);
			}
		}
		return { concurrent, sequential };
	}
}
