# Staff Authentication and Authorization Foundation

## Identity boundaries

`inquiry_team_members` remains the stable operational identity used by Inquiry assignment and workflow history. `staff_accounts` is a separate one-to-one authentication identity that references an existing team member with restrictive deletion. Disabling an account never rewrites historical assignments or workflow events. `communication_recipients` remains a communication destination and is not part of staff authentication.

There is no public registration, role-selection, account-creation, or first-admin endpoint. The first Staff Account still requires a future controlled provisioning workflow. No bootstrap password is stored in source, environment examples, logs, or command arguments.

## Password security

Passwords use Node.js `crypto.scrypt` with a unique 16-byte random salt, a 32-byte derived key, `N=131072` (`ln=17`), `r=8`, `p=1`, and a 256 MiB memory ceiling. The stored format is versioned and strictly parsed: `$yolpol-scrypt$v=1$ln=17,r=8,p=1$<base64url-salt>$<base64url-derived-key>`. Malformed formats and unsupported parameters fail closed, and the final comparison uses `timingSafeEqual`.

Unknown emails are verified against a valid non-credential dummy hash so unknown and known-account attempts both execute scrypt. Unknown email, wrong password, inactive Staff Account, and inactive linked Team Member all return the same external authentication failure. Request bodies and plaintext passwords are never logged.

## Opaque sessions and cookies

The staff credential has 256 random bits and the distinct `yps_` namespace. PostgreSQL stores only two SHA-256 digests with staff-session-specific domain separation: one indexed lookup digest and one constant-time verification digest. The raw cookie credential is never persisted or returned in JSON. Customer `ypc_` conversation credentials cannot be parsed as staff credentials.

Sessions have an absolute eight-hour lifetime with no sliding writes. Resolution joins the session to a minimal current Staff Account and Team Member authorization projection, so it does not fetch the password hash, normalized email, or account timestamps on every authenticated request. A revoked/expired session, disabled account, or inactive operational identity immediately stops authorizing access. Current role is read from the account rather than copied into the session. Logout verifies the credential and records `revoked_at`; repeating logout is safe. The response clears the cookie only after a completed/idempotent logout. If revocation cannot be confirmed because a server dependency fails, the cookie remains available so the browser can retry.

Production uses `__Host-yolpol_staff_session` with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain`, and bounded `Max-Age`/`Expires`. Local HTTP development uses the centralized non-prefixed `yolpol_staff_session` name without `Secure` while retaining the other protections.

## Authorization and trusted actors

Roles are intentionally limited to `ADMIN` and `SALES`. The framework-independent policy currently permits either known role to perform internal Team Operations; this foundation grants no internal Product-pricing capability. A principal contains only Staff Account ID, Team Member ID, current role, safe display name, and a server-derived `staff:<team-member-id>` actor reference. Future workflow HTTP adapters must use the policy-derived actor reference and must never accept a browser-supplied value.

## HTTP security

The only new routes are `POST /api/staff/auth/login`, `POST /api/staff/auth/logout`, and `GET /api/staff/auth/session`. They return `Cache-Control: no-store` and explicit safe DTOs. Login accepts only a strict 4 KiB JSON object containing `email` and `password`. Login and logout require the existing exact canonical/development Origin policy; `SameSite` is defense in depth rather than the only CSRF protection.

Login has its own process-local, constant-memory fixed-window limiter, defaulting to 20 attempts per 60 seconds. It is global rather than email-keyed, so an attacker cannot indefinitely lock one selected account through an account-keyed counter. It is suitable only for the current single-instance phase. Multi-instance deployment needs a shared limiter or a trusted reverse-proxy rate limit keyed by verified client network identity; spoofable forwarding headers are not trusted here.

No `/api/team/*`, `/api/admin/*`, Team/Admin UI, public registration, staff reply command, internal pricing permission, or Product-price projection is added in this phase. Team Operations remains server-only until a separately reviewed protected HTTP feature consumes this authentication boundary.
