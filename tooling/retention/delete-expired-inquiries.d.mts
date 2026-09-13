import type {Pool} from "pg";
export const inquiryRetentionMonths: 24;
export function inquiryRetentionCutoff(now?: Date): Date;
export function deleteExpiredInquiries(database: Pick<Pool,"query">, cutoff: Date): Promise<number>;
