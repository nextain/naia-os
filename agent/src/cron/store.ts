import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CronJob, CronSchedule } from "./types.js";

export interface AddJobOptions {
	id?: string;
	label: string;
	task: string;
	schedule: CronSchedule;
}

export class CronStore {
	private jobs: CronJob[] = [];
	private readonly filePath: string;

	constructor(filePath: string) {
		this.filePath = filePath;
		this.load();
	}

	private load(): void {
		try {
			if (fs.existsSync(this.filePath)) {
				const data = fs.readFileSync(this.filePath, "utf-8");
				this.jobs = JSON.parse(data);
			}
		} catch {
			this.jobs = [];
		}
	}

	private save(): void {
		const dir = path.dirname(this.filePath);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(this.filePath, JSON.stringify(this.jobs, null, "\t"));
	}

	list(): CronJob[] {
		return [...this.jobs];
	}

	get(id: string): CronJob | undefined {
		return this.jobs.find((j) => j.id === id);
	}

	add(options: AddJobOptions): CronJob {
		const id = options.id ?? randomUUID();

		if (this.jobs.some((j) => j.id === id)) {
			throw new Error(`Duplicate job ID: ${id}`);
		}

		const job: CronJob = {
			id,
			label: options.label,
			task: options.task,
			schedule: options.schedule,
			enabled: true,
			createdAt: new Date().toISOString(),
		};

		this.jobs.push(job);
		this.save();
		return job;
	}

	remove(id: string): boolean {
		const idx = this.jobs.findIndex((j) => j.id === id);
		if (idx < 0) return false;
		this.jobs.splice(idx, 1);
		this.save();
		return true;
	}

	update(
		id: string,
		patch: Partial<Pick<CronJob, "label" | "task" | "schedule" | "enabled">>,
	): CronJob | undefined {
		const job = this.jobs.find((j) => j.id === id);
		if (!job) return undefined;

		if (patch.label !== undefined) job.label = patch.label;
		if (patch.task !== undefined) job.task = patch.task;
		if (patch.schedule !== undefined) job.schedule = patch.schedule;
		if (patch.enabled !== undefined) job.enabled = patch.enabled;

		this.save();
		return job;
	}

	/** Update lastFiredAt without triggering a full save notification */
	markFired(id: string): void {
		const job = this.jobs.find((j) => j.id === id);
		if (job) {
			job.lastFiredAt = new Date().toISOString();
			this.save();
		}
	}
}
