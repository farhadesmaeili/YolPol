# Task 0009: Multilingual Privacy Policy

- Status: Implemented
- Date: 2026-08-16
- Stable public-policy update date: `2026-08-16`

Adds localized `/en/privacy`, `/tr/privacy`, `/fa/privacy`, and `/ar/privacy` pages for the approved public operator `YolPol`, public location `Iran – Tehran`, and privacy contact `yolpol@gmail.com`. The policy is technical disclosure, not a claim of company registration, jurisdiction-specific compliance, certification, or absolute security.

The existing Inquiry form still prepares a draft only in browser memory. It has no submission endpoint and does not persist or transmit personal information. Its mandatory unchecked consent now links to the active locale's Privacy Policy. Direct Email and WhatsApp contact continues to use centralized static destinations without inserting form values into URLs.

Intended future secure Inquiry processing covers full name; optional company; email; phone or WhatsApp; preferred contact method; country; optional city and destination; selected Product IDs, requested quantities and canonical units; optional message; active locale and source path; consent status and acceptance time; creation/update times; and limited security metadata. Inquiry records may be retained for at most 24 months and deleted earlier when no longer required. Limited security metadata may be retained for at most 30 days.

Planned security metadata may include a truncated or one-way hashed IP address, User-Agent, submission timestamp, and rate-limit or abuse-prevention data. Hashing is not represented as anonymization. This metadata is limited to rate limiting, spam and abuse prevention, and security investigation; it is not intended for advertising. These controls are conditional because submission infrastructure is not active.

next-intl may use the essential `NEXT_LOCALE` cookie to remember language preference. Inquiry personal data is not stored in `localStorage` or `sessionStorage`. No advertising cookie or analytics platform is intentionally active. Google Analytics and Umami are not installed. Self-hosted Umami is the preferred future analytics option; GA4 remains deferred. Google Search Console is a separate planned search-performance tool and is not visitor analytics or currently verified.

The shared footer contains the localized legal link. Privacy metadata uses the production origin, locale alternates, English `x-default`, and Open Graph fields. Breadcrumb JSON-LD is the only structured data on the route. Adding Privacy produces exactly four sitemap entries and raises the expected total from 72 to 76 URLs.

Future hosting, database, Email, Telegram, automation, analytics, or other material providers require provider-specific policy updates before activation. Any tracking that requires consent must receive an appropriate consent mechanism before loading. Analytics work belongs in a separate task or branch.

The final policy and translations should be reviewed by a qualified legal professional before public production launch or international advertising campaigns. That review must confirm the applicable legal requirements, customer-request process, provider disclosures, international-processing language, retention operation, and consent wording.

## Explicitly approved additional branch scope

This branch also includes refreshed binary content for the nine existing Product primary-image paths, the refreshed YolPol logo at its existing public path, and the Next.js root smooth-scroll declaration correction. Asset filenames and public paths remain unchanged, and no Product facts changed. The previous local rendering of old assets was caused by the generated `.next` cache; clearing and regenerating that cache displayed the refreshed assets successfully.
