import {runOperationsMetricsExporter} from "./operations-metrics";

void runOperationsMetricsExporter().catch(() => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "monitoring.startup_failed",
    service: "operations-metrics",
    errorCode: "STARTUP_CONFIGURATION",
  })}\n`);
  process.exitCode = 1;
});
