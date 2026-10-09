import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {chmodSync, mkdtempSync, readdirSync, realpathSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createLocalAcquisitionSecrets} from "./local-secrets.mjs";

export function assertDisposableCompose(model, project) {
  if (!/^yolpol-acq-test-[a-f0-9]{32}$/u.test(project) || model.name !== project) throw new Error("Disposable project identity rejected.");
  if (Object.keys(model.volumes ?? {}).length) throw new Error("Named volumes are forbidden in acquisition validation.");
  for (const service of Object.values(model.services)) {
    if (service.ports?.length || service.volumes?.some((mount) => mount.type === "volume")) throw new Error("Persistent mounts or published ports rejected.");
  }
  for (const database of ["acquisition-postgres", "n8n-postgres"]) {
    if (!(model.services[database].tmpfs ?? []).some((mount) => mount.startsWith("/var/lib/postgresql/data"))) throw new Error("Disposable PostgreSQL must use tmpfs.");
  }
  if (Object.values(model.networks).some((network) => network.external || !network.internal || !network.name.startsWith(`${project}_`))) throw new Error("Disposable network isolation rejected.");
}

export function assertPrivatePostgresLogs(logs, sentinel, constraints) {
  if (logs.includes(sentinel) || /\b(?:DETAIL|CONTEXT|STATEMENT):/u.test(logs)) throw new Error("PostgreSQL log privacy check failed.");
  for (const constraint of constraints) {
    if (!logs.includes(`ERROR:  duplicate key value violates unique constraint "${constraint}"`)) throw new Error("Safe PostgreSQL duplicate-key error absent.");
  }
}

export function runDisposableValidation(runtime = false) {
  const project = `yolpol-acq-test-${randomUUID().replaceAll("-", "")}`;
  const temporary = mkdtempSync(join(tmpdir(), "yolpol-acq-test-"));
  const secretDirectory = join(temporary, "secrets");
  createLocalAcquisitionSecrets(secretDirectory);
  // The enclosing directory is private. Inside containers, different non-root UIDs
  // need read access to their individually mounted disposable secrets.
  for (const name of readdirSync(secretDirectory)) chmodSync(join(secretDirectory, name), 0o644);
  const prefix = ["compose", "-p", project, "-f", "deploy/customer-acquisition/compose.yaml", "-f", "deploy/customer-acquisition/compose.validation.yaml", "--profile", "migration", "--profile", "validation"];
  const environment = {...process.env, ACQUISITION_SECRET_DIRECTORY: secretDirectory};
  // Never let caller-controlled Compose/Docker environment replace the inspected project contract.
  for (const key of Object.keys(environment)) if (key.startsWith("COMPOSE_")) delete environment[key];
  const run = (args, capture = false, input) => {
    const result = spawnSync("docker", [...prefix, ...args], {cwd: resolve("."), env: environment, input, encoding: "utf8", stdio: capture ? "pipe" : "inherit", timeout: 600000});
    if (result.error || result.status !== 0) throw new Error(`Disposable acquisition operation failed: ${args[0]}`);
    return result.stdout;
  };
  const inspect = (args) => {
    const result = spawnSync("docker", args, {env: environment, encoding: "utf8", timeout: 15000});
    if (result.error || result.status !== 0) throw new Error("Disposable runtime inspection failed.");
    return JSON.parse(result.stdout);
  };
  let inspected = false;
  try {
    const model = JSON.parse(run(["config", "--format", "json"], true));
    assertDisposableCompose(model, project); inspected = true;
    run(["build", "tests", "migrate", "customer-acquisition-api"]);
    run(["up", "-d", "--wait", "--wait-timeout", "90", "acquisition-postgres", "n8n-postgres"]);
    const sentinel = project.slice("yolpol-acq-test-".length);
    for (const [service, user, database] of [["acquisition-postgres", "acquisition_admin", "yolpol_acquisition"], ["n8n-postgres", "n8n_admin", "yolpol_n8n"]]) {
      const expected = {log_error_verbosity: "terse", log_statement: "none", log_min_error_statement: "panic", log_parameter_max_length_on_error: "0", log_min_messages: "warning", log_min_duration_statement: "-1", log_min_duration_sample: "-1", log_transaction_sample_rate: "0", log_duration: "off", log_destination: "stderr", logging_collector: "off"};
      const query = `select json_build_object(${Object.keys(expected).map((key) => `'${key}', current_setting('${key}')`).join(",")})`;
      const settings = JSON.parse(run(["exec", "-T", service, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database, "-c", query], true));
      if (Object.entries(expected).some(([key, value]) => settings[key] !== value)) throw new Error("PostgreSQL logging configuration rejected.");
    }
    run(["run", "--rm", "--no-deps", "migrate"]);
    run(["run", "--rm", "--no-deps", "-e", `ACQUISITION_LOG_SENTINEL=${sentinel}`, "tests"]);
    // A connection-local table tests n8n's PostgreSQL logging without touching its schema.
    // Expected errors are captured, never echoed with client-side DETAIL/payloads.
    const probe = run(["exec", "-T", "n8n-postgres", "psql", "-XqAt", "-U", "n8n_admin", "-d", "yolpol_n8n"], true, `
      \\set ON_ERROR_STOP on
      CREATE TEMP TABLE privacy_probe(email text CONSTRAINT privacy_probe_email UNIQUE, domain text CONSTRAINT privacy_probe_domain UNIQUE);
      INSERT INTO privacy_probe VALUES ('log-${sentinel}@example.test','log-${sentinel}.example');
      \\set ON_ERROR_STOP off
      INSERT INTO privacy_probe VALUES ('log-${sentinel}@example.test','other.example');
      INSERT INTO privacy_probe VALUES ('other@example.test','log-${sentinel}.example');
      \\set ON_ERROR_STOP on
      SELECT 'privacy-probe-complete';
    `);
    if (probe.trim() !== "privacy-probe-complete") throw new Error("PostgreSQL privacy probe failed.");
    for (const [service, constraints] of [["acquisition-postgres", ["acquisition_contact_email", "acquisition_company_domains_pkey"]], ["n8n-postgres", ["privacy_probe_email", "privacy_probe_domain"]]]) {
      assertPrivatePostgresLogs(run(["logs", "--no-color", service], true), sentinel, constraints);
    }
    console.info("Both disposable PostgreSQL logging configurations and duplicate email/domain log privacy checks passed; safe errors remain visible.");
    if (runtime) {
      try { run(["up", "-d", "--wait", "--wait-timeout", "180", "n8n"]); }
      catch (error) {
        // Fresh instance, before any workflow/credential imports or business input.
        // Redact all generated credential values even from upstream startup errors.
        const logs = run(["logs", "--no-color", "--tail", "30", "n8n"], true);
        console.error(logs.replace(/[a-f0-9]{64}/giu, "[redacted]").slice(-6000));
        throw error;
      }
      for (const network of Object.values(model.networks)) {
        const [actual] = inspect(["network", "inspect", network.name]);
        if (!actual.Internal || actual.Labels["com.docker.compose.project"] !== project) throw new Error("Runtime network isolation rejected.");
      }
      for (const id of run(["ps", "--all", "--quiet"], true).trim().split(/\s+/u)) {
        const [actual] = inspect(["container", "inspect", id]);
        if (actual.Config.Labels["com.docker.compose.project"] !== project || Object.keys(actual.HostConfig.PortBindings ?? {}).length || actual.Mounts.some((mount) => mount.Type === "volume")) throw new Error("Runtime port/storage isolation rejected.");
        if (["n8n", "customer-acquisition-api"].includes(actual.Config.Labels["com.docker.compose.service"])) {
          if (!actual.HostConfig.ReadonlyRootfs || actual.Config.User !== "1000:1000" || !actual.HostConfig.CapDrop.includes("ALL") || !actual.HostConfig.SecurityOpt.includes("no-new-privileges:true")) throw new Error("Runtime process hardening rejected.");
        }
      }
      run(["exec", "-T", "n8n", "n8n", "import:credentials", "--input=/opt/acquisition-workflows/credential-reference.json"]);
      run(["exec", "-T", "n8n", "n8n", "import:workflow", "--input=/opt/acquisition-workflows/0082-synthetic-company-intake.json"]);
      run(["exec", "-T", "n8n", "n8n", "export:workflow", "--id=AcquisitionFoundation0082", "--output=/tmp/task0082-workflow-check.json"]);
      run(["exec", "-T", "n8n", "node", "-e", "const [workflow] = JSON.parse(require('node:fs').readFileSync('/tmp/task0082-workflow-check.json','utf8')); if (workflow.active !== false || workflow.nodes.length !== 4 || workflow.nodes[0].type !== 'n8n-nodes-base.manualTrigger') process.exit(1);"]);
      run(["exec", "-T", "n8n", "node", "-e", `
        const net = require('node:net');
        const denied = host => new Promise((resolve, reject) => {
          const socket = net.connect({host, port: 5432});
          socket.setTimeout(1500);
          socket.once('connect', () => { socket.destroy(); reject(new Error('Unexpected database reachability')); });
          socket.once('error', () => resolve());
          socket.once('timeout', () => { socket.destroy(); resolve(); });
        });
        (async () => {
          for (const path of ['/health/live', '/health/ready']) {
            if (!(await fetch('http://customer-acquisition-api:8080' + path)).ok) throw new Error('API health failed');
          }
          const response = await fetch('http://customer-acquisition-api:8080/v1/observations', {method:'POST'});
          if (response.status !== 401) throw new Error('API authentication failed');
          await denied('acquisition-postgres');
        })().catch(() => { console.error('Disposable runtime boundary check failed'); process.exitCode = 1; });
      `]);
      // n8n 2.42.4 initializes file credential overrides in `start`, not `execute`.
      // Exercise the authenticated server/manual path; never persist overrides to
      // work around a CLI difference, and never change the inactive workflow.
      run(["exec", "-T", "n8n", "node", "/opt/acquisition-validation/n8n-runtime-smoke.mjs"]);
      run(["run", "--rm", "--no-deps", "tests", "node", "-e", `
        const {Pool} = require('pg');
        const pool = new Pool({host:'acquisition-postgres',database:'yolpol_acquisition',user:'acquisition_runtime',password:require('node:fs').readFileSync('/run/secrets/acquisition_runtime_password','utf8').trim(),connectionTimeoutMillis:3000,statement_timeout:3000});
        (async () => {
          for (let attempt = 0; attempt < 120; attempt++) {
            const result = await pool.query("select result->>'status' as status from acquisition_operations where key=$1", ['task0082-synthetic-company-1']);
            if (result.rows.length === 1 && ['CREATED','EXISTING'].includes(result.rows[0].status)) return;
            await new Promise(resolve => setTimeout(resolve,250));
          }
          throw new Error('Manual workflow persistence absent');
        })().catch(() => { console.error('Disposable workflow persistence verification failed'); process.exitCode=1; }).finally(() => pool.end());
      `]);
      console.info("Disposable n8n readiness, API authentication, database isolation and synthetic workflow execution passed.");
    }
  } finally {
    try {
      if (inspected) {
        for (const id of run(["ps", "--all", "--quiet"], true).trim().split(/\s+/u).filter(Boolean)) {
          const [actual] = inspect(["container", "inspect", id]);
          if (actual.Config.Labels["com.docker.compose.project"] !== project || actual.Mounts.some((mount) => mount.Type === "volume")) throw new Error("Disposable container cleanup identity rejected.");
        }
        const networks = spawnSync("docker", ["network", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"], {env: environment, encoding: "utf8", timeout: 15000});
        if (networks.error || networks.status !== 0) throw new Error("Disposable network cleanup inspection failed.");
        for (const id of networks.stdout.trim().split(/\s+/u).filter(Boolean)) {
          const [actual] = inspect(["network", "inspect", id]);
          if (actual.Labels["com.docker.compose.project"] !== project || !actual.Name.startsWith(`${project}_`) || !actual.Internal) throw new Error("Disposable network cleanup identity rejected.");
        }
        run(["down", "--remove-orphans", "--timeout", "15"]);
      }
    } finally {
      // Only our newly created private temporary directory; no Docker volumes are deleted.
      const cleanupTarget = realpathSync(temporary);
      if (dirname(cleanupTarget) !== realpathSync(tmpdir()) || !basename(cleanupTarget).startsWith("yolpol-acq-test-")) throw new Error("Temporary cleanup target rejected.");
      rmSync(cleanupTarget, {recursive: true, force: true});
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runDisposableValidation(process.argv.includes("--runtime")); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
