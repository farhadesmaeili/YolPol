import {Pool, type PoolConfig} from "pg";
import {readPostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";

const globalPools = globalThis as typeof globalThis & {__yolpolInquiryPostgresPool?: Pool};

export function createPostgresPool(config: PoolConfig): Pool { return new Pool(config); }

export function getInquiryPostgresPool(): Pool {
  if (globalPools.__yolpolInquiryPostgresPool) return globalPools.__yolpolInquiryPostgresPool;
  const pool = createPostgresPool(readPostgresConfig());
  if (process.env.NODE_ENV === "development") globalPools.__yolpolInquiryPostgresPool = pool;
  return pool;
}

export async function closeInquiryPostgresPool(): Promise<void> {
  const pool = globalPools.__yolpolInquiryPostgresPool;
  if (!pool) return;
  delete globalPools.__yolpolInquiryPostgresPool;
  await pool.end();
}
