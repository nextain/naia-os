/** Schedule types for cron jobs */
export type CronSchedule =
	| { type: "at"; date: string } // ISO 8601 one-shot
	| { type: "every"; intervalMs: number } // Recurring interval
	| { type: "cron"; expression: string }; // Standard cron expression

/** Payload delivered when a cron job fires */
export interface CronPayload {
	jobId: string;
	label: string;
	task: string;
	firedAt: string; // ISO 8601
}

/** Persisted cron job definition */
export interface CronJob {
	id: string;
	label: string;
	task: string;
	schedule: CronSchedule;
	enabled: boolean;
	createdAt: string; // ISO 8601
	lastFiredAt?: string;
}
