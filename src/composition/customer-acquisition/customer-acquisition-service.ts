import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {CustomerAcquisition} from "@/features/customer-acquisition/application/use-cases/customer-acquisition";
import {acquisitionDatabaseConfig, readAcquisitionSecret} from "@/features/customer-acquisition/infrastructure/config/acquisition-config";
import {createAcquisitionHandler} from "@/features/customer-acquisition/infrastructure/http/acquisition-handler";
import {PostgresAcquisitionRepository} from "@/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-acquisition-repository";
import {presentAcquisitionResult} from "@/features/customer-acquisition/presentation/presenters/acquisition-result-presenter";
import {createStructuredLogger} from "@/shared/infrastructure/observability/structured-logger";

export function createCustomerAcquisitionService(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const config = acquisitionDatabaseConfig(environment, "runtime");
  const token = readAcquisitionSecret(environment.ACQUISITION_API_TOKEN_FILE);
  const pool = new Pool(config);
  const logger = createStructuredLogger({service: "customer-acquisition", environment: {YOLPOL_LOG_LEVEL: "info"}});
  pool.on("error", () => logger.error("acquisition.database_unavailable"));
  const application = new CustomerAcquisition(new PostgresAcquisitionRepository(pool));
  const handle = createAcquisitionHandler({application, token, requestId: randomUUID, present: presentAcquisitionResult,
    log: (fields) => logger.info("acquisition.request_completed", fields)});
  return {handle, close: () => pool.end()};
}
