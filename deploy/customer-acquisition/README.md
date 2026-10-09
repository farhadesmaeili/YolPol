# Customer Acquisition: local synthetic foundation

Task 0082 is an optional subsystem. Starting normal YOLPOL Development or deploying
the application does not start it. Nothing here activates Staging, Production, email,
discovery, Telegram or AI. Never supply real company/contact records or provider keys.

## Ownership and topology

`customer-acquisition-api` owns business rules and the `yolpol_acquisition` database.
`n8n` owns orchestration and its `yolpol_n8n` database. Each database has its own
PostgreSQL container and volume. There are no shared tables or main YOLPOL credentials.
All three networks are Docker `internal` networks with explicit membership:

| Network | Members |
| --- | --- |
| orchestration | n8n, customer-acquisition-api |
| acquisition_database | acquisition-postgres, customer-acquisition-api, profile-gated migrate |
| n8n_database | n8n-postgres, n8n |

Only `127.0.0.1:5678` is published. Databases and API have no host port. This is a
same-host Docker trust boundary, not protection against a host administrator. There
is no Internet egress network. The editor uses HTTP and non-secure cookies solely
for loopback local use; this configuration must never be promoted to a server.

## Verified n8n pin and settings

On 2026-10-08 the official GitHub release API reported `n8n@2.42.4` as published
2026-10-07, `draft=false`, `prerelease=false`. Official registry inspection showed
both `stable` and `2.42.4` resolve to:

`sha256:9c0862a08090c79122069e23131d27529c250b92e90c9d51a6ec406fe1527c4e`

The committed reference uses the version plus immutable OCI index digest. The
linux/amd64 manifest is `sha256:667c1ec79603670c5b4bfbc38f344016814cca79971dca72e58ea139d8a4023b`.

Sources: [official release](https://github.com/n8n-io/n8n/releases/tag/n8n%402.42.4),
[nodes](https://docs.n8n.io/hosting/configuration/environment-variables/nodes/),
[security](https://docs.n8n.io/hosting/configuration/environment-variables/security/),
[credentials](https://docs.n8n.io/hosting/configuration/environment-variables/credentials/),
[database](https://docs.n8n.io/hosting/configuration/environment-variables/database/),
[execution limits](https://docs.n8n.io/hosting/configuration/environment-variables/executions/),
[deployment](https://docs.n8n.io/hosting/configuration/environment-variables/deployment/).

The runtime loads only Manual Trigger, Set and HTTP Request nodes. Community nodes
are disabled; no custom extension mount exists. Node environment access is blocked.
Workflow input/output persistence is disabled for success, error and manual runs;
execution timeout is 30 seconds. Network isolation is authoritative even where an
upstream background feature attempts external communication. An administrator can
edit a workflow in the local editor; source-controlled validation does not enforce
immutable UI contents. Do not use this stack for untrusted editor users.

Legacy version-notification/personalization flags were omitted because their support
in this release was not established by the inspected configuration sources. No claim
is made that every background/UI request is disabled; runtime Internet egress remains
absent through the Docker network contract. Python execution is explicitly disabled.

The pinned runtime generates editor assets under `/home/node/.cache` at startup.
Disposable startup exposed an `ENOENT` failure there with a read-only root filesystem.
A bounded 64 MiB, UID/GID 1000-only tmpfs is provided for that cache; the root remains
read-only, all capabilities remain dropped and no-new-privileges remains enabled.

## Secrets and first local start

Required tools: Docker Compose supporting `!override` (2.24.4+), Docker, Node and the
repository's pinned pnpm. Build from the repository root. The dedicated Dockerfile
uses its own allow-listed build context and does not modify the main Dockerfile.

1. Run `pnpm acquisition:secrets:local`. It exclusively creates
   `deploy/customer-acquisition/secrets`, generates independent 32-byte random
   credentials and writes no values to stdout. It refuses an existing directory.
2. Copy `runtime.env.example` to `deploy/customer-acquisition/runtime.env` and set
   `ACQUISITION_SECRET_DIRECTORY` to the absolute local secrets directory (forward
   slashes are convenient on Windows). The runtime file contains paths only.
3. Restrict the directory to the local operator account using OS permissions/ACLs.
   File-backed Compose secrets retain host permissions: on Linux, grant read access
   only to the receiving container UIDs (API/n8n UID 1000 and PostgreSQL's image UID),
   while retaining a private parent directory. Windows Docker Desktop uses its own
   mount permission mapping. Do not solve a permission failure by publishing secrets.
4. Inspect the resolved Compose model before startup. Never combine this file with
   another YOLPOL Compose project or substitute existing volume names.

```sh
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml config --quiet
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml build customer-acquisition-api migrate
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml up -d --wait acquisition-postgres n8n-postgres
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml --profile migration run --rm migrate
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml up -d --wait customer-acquisition-api n8n
```

These commands create this subsystem's local volumes only when intentionally invoked
by a developer. They were not used to activate a persistent stack during Task 0082.
The runtime never migrates acquisition tables. n8n manages only its own schema.
Changing initialization files does not modify an already initialized database.

Open `http://localhost:5678` and create a local owner account. Do not configure SMTP.
Import the empty credential reference and inactive workflow using:

```sh
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml exec n8n n8n import:credentials --input=/opt/acquisition-workflows/credential-reference.json
docker compose --env-file deploy/customer-acquisition/runtime.env -f deploy/customer-acquisition/compose.yaml exec n8n n8n import:workflow --input=/opt/acquisition-workflows/0082-synthetic-company-intake.json
```

The reference contains no credential data. `CREDENTIALS_OVERWRITE_DATA_FILE` supplies
the Header Auth name/value from a protected JSON file, generated from the API token.
Overwrite persistence is disabled. The token never enters workflow JSON or an
exported credential artifact. The overwrite applies to the sole HTTP Header Auth
credential type in this dedicated instance. The Manual Trigger always submits the
same synthetic observation/key, demonstrating replay without additional records.
Keep the workflow inactive and execute it manually only.

Do not substitute `n8n execute` for the server/manual path when validating these
file overrides. In the pinned release, `Start` calls `CredentialsOverwrites.init()`
but the CLI `Execute`/base command does not; a CLI trial therefore failed
authentication. The disposable verifier uses a synthetic local owner and the normal
authenticated manual-run server endpoint. It does not enable overwrite persistence
or inject secret values into workflow JSON. This version-specific verification uses
the [pinned manual-run schema](https://github.com/n8n-io/n8n/blob/n8n%402.42.4/packages/%40n8n/api-types/src/dto/workflows/manual-run.dto.ts)
and must be reviewed when updating n8n.

To stop your local subsystem, use the exact same `--env-file` and `-f` arguments
with `stop`. Do not use `down -v`, prune, volume removal, or reset another project.
Recovery/rotation and retention for persistent data need a separate reviewed operation.

## API and data policy

Every business request uses `Authorization: Bearer <independent token>` on the private
network. Comparison hashes both values then uses a constant-time comparison. Limits:
8 KiB headers, 8 KiB JSON body, 10-second HTTP request deadline, 32 connections,
60 business/authentication attempts per minute per process, four database connections,
3-second lock timeout and 5-second SQL statement timeout. The limiter is process-local;
this foundation deploys one API instance. Health probes are excluded from its quota.

| Method/path | Strict input | Result |
| --- | --- | --- |
| POST `/v1/observations` | synthetic=true, idempotencyKey, company{name,country,domain}, segment, source{system,observedAt,runReference, optional recordId/url}, optional contact{name,email} | CREATED, EXISTING or REVIEW_REQUIRED plus opaque IDs |
| POST `/v1/qualifications` | idempotencyKey, leadId, policyVersion=foundation-v1, facts{marketMatch,segmentMatch,packagingRelevance} | ASSESSED, score and decision |
| POST `/v1/suppressions` | idempotencyKey, kind=DOMAIN/EMAIL, target, reason=TEST_OPT_OUT/MANUAL_REVIEW, sourceReference | SUPPRESSED and opaque ID |
| POST `/v1/suppressions/release` | idempotencyKey, suppressionId | RELEASED and opaque ID |
| GET `/health/live`, `/health/ready` | none; private probe exception to authentication | bounded status, no business data |

Unknown fields are rejected at every nested input boundary, including pricing fields.
Errors are fixed codes: 400 invalid, 401 unauthenticated, 404 absent, 405 method,
409 conflicting idempotency reuse, 413 oversized, 415 media type, 429 rate limit,
503 unavailable. Request IDs are server-generated. Logs contain only fixed event
names, opaque request ID, status and duration. An HTTP timeout cannot prove rollback:
retry the same key/payload to reconcile any committed result.

Domains use WHATWG hostname parsing, IDNA ASCII form, lowercase and trailing-dot
removal. Exact hostnames are identities: no suffix-list approximation, apex/subdomain
collapse or automatic domain aliasing. Only reserved `.example`, `.test` and
`example.com/org/net` names and their subdomains pass the synthetic boundary.
Emails trim/NFC-normalize the original representation, normalize only their domain,
and preserve ASCII local-part case, dots and plus tags. Quoted/non-ASCII local parts
are rejected. This intentionally favors avoiding false merges over case-insensitive
mailbox deduplication; a later verified provider policy can add explicit aliases.
Country accepts two ASCII letters, stored uppercase; ISO membership and actual market
eligibility are not asserted. Segments are bounded lowercase keys, independent of locale.

Text bounds retain the existing raw JavaScript UTF-16 code-unit limit, then apply
trim/NFC and check the final value against the same limit. Company name keys are
checked independently after lowercase conversion (including U+0130 expansion), at
both the HTTP input boundary and repository entry. These limits are conservative
relative to PostgreSQL character counts: a supplementary character consumes two
UTF-16 units but one database character. This intentionally does not broaden the
accepted input policy. Nothing is truncated; invalid final values return the existing
safe 400 validation response. Company/contact names remain bounded to 160, original/
canonical emails to 254, domains to 253 and serialized source URLs to 1024. Existing
ASCII identifier/segment/country patterns and post-IDNA/URL bounds remain enforced.

Strong identity conflicts produce immutable review observations with no company/contact
target and do not change existing facts. Name+country only signals review. Matching
strong identities cannot silently rewrite names, countries or contacts. Provider record
IDs are company-scoped within a source system; contact-only provider identity needs a
future extension. An observation containing a contact targets that contact; its company
is available through the immutable contact relation. No raw HTML/provider payload is stored.

Observation SHA-256 covers UTF-8 `JSON.stringify` of a fixed-order version-1 object:
company{name,country,domain}, contact{name,normalized email} or null, segment, and
source{system,recordId,url,observedAt}. Retry key and run reference are excluded.
The original observation time remains stable across retries. The idempotency ledger
uses a global key namespace across operations; same key+semantic fingerprint returns
the original result, changed input or operation yields 409. Run references therefore
preserve first accepted provenance on replay. New keys append new observations.

The synthetic pilot serializes mutations with one transaction advisory lock. This
keeps multi-identity decisions and suppression/scoring atomic at its low request rate;
database unique/FK/check constraints remain authoritative. Scaling to per-identity
locking is deferred until concurrency demand exists.

`foundation-v1` scores market match 30, segment match 40, packaging relevance 30.
At least 70 gives FOUNDATION_FIT, otherwise REVIEW_REQUIRED. Any active exact email
or domain suppression gives BLOCKED regardless of score. This is a testable scaffold,
not an approved commercial qualification policy. Facts are caller-supplied synthetic
booleans; assessment history preserves policy, facts, reasons and original score.
Replaying an old qualification returns its historical result, not current suppression
eligibility. Future sending MUST perform a fresh authoritative suppression check.

Suppression target uniqueness is partial over active rows. Release is one-way,
timestamped and idempotent; suppressing again creates another historical record.
No deletion or automatic expiry exists. Retention and possible keyed hashes require
a future privacy decision. Domain suppression is exact-host only in this foundation.

## Validation and operational boundary

Both PostgreSQL services use `log_error_verbosity=terse` to omit value-bearing
`DETAIL`, `CONTEXT`, `HINT` and internal `QUERY` fields. Existing statement and bind-
parameter logging restrictions remain; operational errors are not disabled.
This is error-detail minimization, not a universal scrubber for arbitrary SQL error
messages. Do not introduce user-controlled SQL or enable statement/duration logging.
See [PostgreSQL 17 logging](https://www.postgresql.org/docs/17/runtime-config-logging.html).

The disposable harness introspects both databases' effective logging settings,
triggers real duplicate email/domain failures with a unique synthetic sentinel,
and checks container logs for absent values/details and present safe constraint
errors. Acquisition uses its actual tables and tests a real PostgreSQL error through
the API handler; n8n's database uses a connection-local temporary table without
changing its schema. Both database containers are therefore started even for the
non-n8n integration command. Cleanup checks project labels/mounts/network ownership;
private generated credentials are removed even if Docker cleanup fails.

`pnpm test:acquisition` runs ordinary Vitest domain/API/architecture/workflow and
read-only Compose resolution tests. `pnpm db:acquisition:check` validates independent
Drizzle metadata without connecting. The main migration fingerprint is regression-tested.

`pnpm test:acquisition:disposable` creates a UUID-named project, validates its resolved
model, uses tmpfs databases without host ports or named volumes, migrates and runs
real PostgreSQL integration tests, then removes only that project's containers/networks.
`pnpm test:acquisition:runtime` additionally starts the pinned n8n image, checks API/n8n
readiness, imports/exports the inactive workflow, checks actual network/port/process
hardening, rejects unauthenticated API access and n8n-to-acquisition-database traffic,
and requests a manual workflow execution using a disposable synthetic owner. A
separate acquisition-side verifier checks the resulting committed operation; n8n
never receives database credentials. Only disposable random credentials are generated.
No existing runtime container/volume is targeted. The validation variant publishes
no host ports at all; the normal loopback-only editor mapping is verified statically.
The test image receives admin/migrator credentials solely for guarded disposable tests;
the normal API receives only the runtime password and API token.

NOW: local synthetic foundation. NEXT: one permitted discovery source, verification,
AI/Telegram contracts, retention and suppression policy. LATER: real outreach,
campaigns, follow-ups, reply handling, operational backups/restore/monitoring and any
VPS/Production activation. The existing Inquiry/Conversation/Staff/AI/Telegram systems
remain authoritative for their own workflows.
