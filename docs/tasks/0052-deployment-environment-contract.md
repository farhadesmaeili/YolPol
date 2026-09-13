# Deployment Environment Contract

## Goal and scope

This feature separates YOLPOL's stable Production public identity from the origin of the running application. It is an application configuration and search-indexing safety boundary, not deployment infrastructure. It adds no database migration, container definition, reverse proxy, delivery workflow, worker process, monitoring, backup, server provisioning, or live provider action.

The canonical public origin remains `https://yolpol.com`. Canonical URLs, locale alternates, `x-default`, Open Graph URLs, sitemap Production URLs, and Organization/Product public identity continue to use that origin regardless of where the application is running.

## Server-side environment variables

`YOLPOL_DEPLOYMENT_ENVIRONMENT` is the explicit deployment identity. The only supported values are `development`, `test`, `staging`, and `production`. `NODE_ENV=production` requires an explicit `staging` or `production` identity because `NODE_ENV` cannot distinguish those environments.

`YOLPOL_APP_ORIGIN` is the exact server-side browser and operational origin for Staging and Production. It must be an absolute HTTPS origin without credentials, a non-root path, query, or fragment. Production additionally requires it to equal the canonical `https://yolpol.com`; Staging requires a distinct origin. It is deliberately not a `NEXT_PUBLIC_*` value.

`YOLPOL_DEV_ORIGIN` remains the optional Development-only LAN/device origin. It is the Development runtime origin when present. Without it, `http://localhost:3000` is the operational fallback and exact request-Host-matched loopback origins retain the existing local browser behavior. `YOLPOL_APP_ORIGIN` does not create a second Development source of truth.

## Environment behavior

Local Development uses `NODE_ENV=development`. `YOLPOL_DEPLOYMENT_ENVIRONMENT` may be absent or `development`; `YOLPOL_DEV_ORIGIN` remains optional and retains its validated HTTP/HTTPS origin contract.

Vitest and the disposable PostgreSQL integration suite use `NODE_ENV=test`. They infer the isolated `test` deployment identity and ignore deployment variables so a developer's local environment cannot change deterministic test behavior. The clean CI build also needs no deployment secret: deployment values are read only by runtime boundaries.

Staging uses:

```text
NODE_ENV=production
YOLPOL_DEPLOYMENT_ENVIRONMENT=staging
YOLPOL_APP_ORIGIN=https://staging.yolpol.com
```

Browser Origin checks accept only the exact configured Staging application origin. Cookies retain Production-mode `Secure`, `HttpOnly`, `SameSite=Strict`, and `__Host-` semantics. Every public localized response receives `X-Robots-Tag: noindex, nofollow, noarchive`; `robots.txt` disallows all crawling and advertises no sitemap; `sitemap.xml` is empty. Missing or malformed deployment configuration fails closed for Origin trust and indexing.

Production uses:

```text
NODE_ENV=production
YOLPOL_DEPLOYMENT_ENVIRONMENT=production
YOLPOL_APP_ORIGIN=https://yolpol.com
```

Browser Origin checks accept only the exact Production application origin. Production indexing, canonical metadata, robots, and sitemap behavior remain enabled.

## Runtime and static-generation boundary

Localized public pages, including their canonical and Open Graph metadata, are statically generated. They deliberately remain environment-neutral and always identify the Production public site. Staging isolation is applied at request time through an `X-Robots-Tag` response header. The generated `robots.ts` and `sitemap.ts` metadata routes are explicitly dynamic so their Staging behavior is also selected at request time.

This permits one immutable application image to be promoted from Staging to Production without making the public pages dynamic. The runtime must provide the correct deployment identity and application origin on every start. A future Staging reverse proxy should add the same `X-Robots-Tag` directive as defense in depth and may additionally restrict access, but proxy configuration is outside this feature.

## Operational URLs and Telegram

The Staff inquiry link created by the notification worker is operational, so it uses the runtime application origin. Canonical SEO and structured-data URLs do not. Telegram webhook setup continues to use its deliberately separate `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN`; Telegram webhook secret-header authentication and protocol behavior are unchanged.

## Apex and `www` policy

The canonical Production host is the apex `https://yolpol.com`. A future reverse proxy should permanently redirect `https://www.yolpol.com` to the corresponding apex URL. Browser Origin validation does not trust `www`, host suffixes, forwarded-host headers, or wildcard subdomains.
