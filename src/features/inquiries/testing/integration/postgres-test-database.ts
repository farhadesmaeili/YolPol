import type {PoolConfig} from "pg";
import {parsePostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";

export function safeIntegrationPoolConfig(value: string | undefined): PoolConfig {
  const config = parsePostgresConfig(value);
  const url = new URL(config.connectionString!);
  const database = url.pathname.slice(1);
  const safeHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!safeHost || database !== "yolpol_integration" || decodeURIComponent(url.username) !== "yolpol_test" || url.port !== "55432") {
    throw new Error("Integration database safety check failed.");
  }
  return {...config, max: 4};
}
