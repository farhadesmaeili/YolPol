# IndexNow integration

## Purpose and scope

YOLPOL can explicitly submit its current canonical public URL set to IndexNow for initial Production activation or when a release materially affects the whole public site. The integration is Production-only and server-side. It does not add a public submission API, a browser call, a render/startup/build side effect, a database table, a long-running worker, or automatic release coupling.

IndexNow is an additional discovery signal. It does not replace `sitemap.xml`, canonical metadata, hreflang/x-default, crawlable links, robots policy, Bing Webmaster Tools site ownership, or ordinary search-engine crawling. A `200` response means the batch was submitted; `202` means it was accepted pending key validation. Neither response guarantees indexing.

## Architecture

`src/composition/seo/public-indexable-pages.ts` is the one authoritative composition for sitemap entries and submission URLs. It preserves the existing ten static paths across `en`, `tr`, `fa`, and `ar`, then obtains only published locale-available Product routes through the existing Product composition and Product sitemap presenter. `src/app/sitemap.ts` remains a thin Production-aware metadata route, and IndexNow maps the same entries to URLs. The current result remains 76 unique canonical URLs.

The `src/features/indexnow` feature separates domain validation, the application submission use case and ports, file-backed key and bounded HTTP adapters, safe verification/operation presenters, and reusable test fakes. The fixed transport endpoint is `https://api.indexnow.org/indexnow`. URLs are deduplicated and sorted, validated as exact `https://yolpol.com` URLs, and sent in batches of at most 10,000. The adapter uses one request per batch, rejects redirects, applies a 10-second timeout, and performs no retries. It classifies `200`, `202`, `400`, `403`, `422`, `429`, timeout/network failures, unexpected statuses, and `5xx` without reading or logging a provider response body.

## Key verification and lifecycle

Production serves `GET https://yolpol.com/indexnow-key.txt` from a root App Router Route Handler. The route is not locale-prefixed and is intentionally absent from the sitemap. It reads only `INDEXNOW_KEY_FILE=/run/secrets/indexnow_key`, trims ASCII space/tab/newline/CR at the boundaries, validates the key, and returns exactly the key as `text/plain; charset=utf-8` with `Cache-Control: no-store`.

Staging returns `404` before reading a key. Missing or malformed Production configuration returns a generic `503`; neither response exposes a key, filesystem path, or validation detail. The proxy matcher excludes dot-containing paths, so this route enforces the Production-only decision itself instead of depending on proxy headers.

The source file is `/opt/yolpol/production/secrets/indexnow-key`, owned by `10001:10001` with mode `0400`. It is installed or rotated through the closed Production bootstrap secret schema as `INDEXNOW_KEY`; the value is never committed or placed in `runtime.env`. Although the protocol makes the verification value public, its source remains file-backed so root can rotate it deliberately.

To rotate it, root prepares a new compliant value using an approved secret-generation process, performs `secret-rotate production` with the complete closed Production secret document, runs `check-production`, recreates the Production web service from the approved image so it serves the new value, verifies the public key resource, and only then submits. Old and new values must never appear in shell arguments or logs.

## Production operation

The profile-gated `indexnow-submit` service reuses the approved worker image and runs `node --conditions=react-server --import tsx tooling/indexnow/submit-indexnow.ts`. It runs as `10001:10001` with a read-only root, private bounded `/tmp`, all capabilities dropped, `no-new-privileges`, bounded resources/logging, no port, no host mount, and only `provider_egress`. It receives only Production deployment identity plus the `indexnow_key` secret. It has no PostgreSQL environment/network, Telegram/Groq/backup secret, or recovery access.

The operator invokes the fixed, argument-free, audited, locked operation once during initial Production activation, or deliberately when a release materially affects the whole public site:

```sh
sudo /opt/yolpol/bin/yolpol-deploy production-indexnow-submit
```

The wrapper fixes the Production project, profile, service, host, endpoint, key location, and URL source. It accepts no URL, host, key, environment, Compose, or service argument. Success output is one minimal JSON line with receipt classification, URL count, and batch count. Failure output contains only a safe reason code and exits non-zero. The key and authenticated request body are never logged.

Do not invoke this complete-set operation automatically after every ordinary release. Release-to-release URL diffing and automatic changed-URL detection are intentionally deferred. A future integration should submit only URLs added, updated, deleted, or otherwise materially changed by a release, without adding arbitrary URL arguments to this operator command.

IndexNow availability remains independent of deployment correctness: a provider outage must not fail or roll back an otherwise healthy deployment. `sitemap.xml` remains the complete long-term URL inventory, while this explicit full-set operation is a bounded initial-activation or whole-site-change tool.

## Activation and verification

No real key exists in this repository. Initial activation must follow this order without weakening Production validation:

1. Refresh the reviewed host/bootstrap/operations contracts through the existing trusted-root workflow.
2. Install or rotate the complete Production secret document, including a newly generated compliant `INDEXNOW_KEY`.
3. Install or update the closed Production `runtime.env` contract, including the fixed host key-file path.
4. Run `check-production` and require validation to pass.
5. Recreate the approved immutable Production web service with the IndexNow secret.
6. Request `https://yolpol.com/indexnow-key.txt` and confirm status `200`, UTF-8 text, and an exact match to the protected source without exposing it elsewhere.
7. Run `production-indexnow-submit` once for initial activation and retain the safe audit/result evidence as submitted or accepted, not indexed.
8. Confirm `https://yolpol.com/sitemap.xml` still exposes the complete canonical Production set and Staging exposes neither a sitemap set nor the Production key.
9. In Bing Webmaster Tools, verify ownership of `https://yolpol.com`, submit or retain the sitemap, inspect representative localized URLs, and review IndexNow submission diagnostics or crawl discovery after propagation. Key verification occurs through the public root resource; it is not a substitute for Webmaster Tools ownership verification.

## Failure behavior and limitations

Invalid environment, key, URL, or empty URL set fails before transmission. Protocol rejection, rate limiting, timeout, network failure, unexpected status, and `5xx` stop the operation with a non-zero exit. There is no automatic retry, persistence, scheduler, monitoring stack, or rollback effect.

This initial operation submits the current release-derived canonical set. It does not detect release-to-release changes or arbitrary runtime content mutations, guarantee crawl or indexing, report per-URL indexing state, replace the complete sitemap/robots inventory, or expose Product prices. Staging, Development, and Test cannot submit. Until changed-URL detection exists, ordinary releases rely on `sitemap.xml` unless the release materially changes the whole public site and the full-set operation is deliberately selected.
