import {randomUUID} from "node:crypto";
import {CompanyDiscovery} from "@/features/customer-acquisition/application/use-cases/company-discovery";
import {loadDiscoveryAuthentication} from "@/features/customer-acquisition/infrastructure/config/discovery-auth-config";
import {discoveryDatabaseConfig} from "@/features/customer-acquisition/infrastructure/config/discovery-database-config";
import {runtimeDiscoverySourceRegistry} from "@/features/customer-acquisition/infrastructure/config/discovery-source-registry";
import {createDiscoveryHandler} from "@/features/customer-acquisition/infrastructure/http/discovery-handler";
import {PostgresDiscoveryRepository} from "@/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-discovery-repository";
import {presentDiscoveryBatch, presentDiscoveryQueue, presentDiscoveryReceipt} from "@/features/customer-acquisition/presentation/presenters/discovery-result-presenter";
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
  const authenticate = loadDiscoveryAuthentication(environment.ACQUISITION_DISCOVERY_AUTH_FILE, token);
  const intakeConfig = environment.ACQUISITION_DISCOVERY_AUTH_FILE ? discoveryDatabaseConfig(environment, "INTAKE") : null;
  const reviewerConfig = environment.ACQUISITION_DISCOVERY_AUTH_FILE ? discoveryDatabaseConfig(environment, "REVIEW") : null;
  if (intakeConfig && reviewerConfig && (intakeConfig.password === reviewerConfig.password || intakeConfig.password === config.password || reviewerConfig.password === config.password)) {
    throw new Error("Discovery database credentials must be independent.");
  }
  const pool = new Pool(config);
  const discoveryPools = {intake: intakeConfig ? new Pool(intakeConfig) : null, reviewer: reviewerConfig ? new Pool(reviewerConfig) : null};
  const logger = createStructuredLogger({service: "customer-acquisition", environment: {YOLPOL_LOG_LEVEL: "info"}});
  pool.on("error", () => logger.error("acquisition.database_unavailable"));
  discoveryPools.intake?.on("error", () => logger.error("acquisition.database_unavailable"));
  discoveryPools.reviewer?.on("error", () => logger.error("acquisition.database_unavailable"));
  const application = new CustomerAcquisition(new PostgresAcquisitionRepository(pool));
  const acquisitionHandle = createAcquisitionHandler({application, token, requestId: randomUUID, present: presentAcquisitionResult,
    log: (fields) => logger.info("acquisition.request_completed", fields)});
  const discoveryHandle = createDiscoveryHandler({application: new CompanyDiscovery(new PostgresDiscoveryRepository(discoveryPools, runtimeDiscoverySourceRegistry)),
    authenticate, requestId: randomUUID, present: {receipt: presentDiscoveryReceipt, batch: presentDiscoveryBatch, queue: presentDiscoveryQueue},
    log: fields => logger.info("acquisition.request_completed", fields)});
  const handle = (request: Request) => new URL(request.url).pathname.startsWith("/v1/discovery/") ? discoveryHandle(request) : acquisitionHandle(request);
  return {handle, close: async () => { await Promise.all([pool.end(), discoveryPools.intake?.end(), discoveryPools.reviewer?.end()]); }};
}
