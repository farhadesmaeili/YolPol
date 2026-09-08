# Inquiry and Customer Chat redesign

## Inspection and scope

- Baseline: `feature/inquiry-chat-redesign`, clean worktree; Next 16.3, React 19, Tailwind 4, no motion library.
- Static localized `/[locale]/inquiry` composes public product options and a client form. Chat currently appears below the form on the same route and resumes using an HttpOnly cookie.
- `SubmitInquiry` validates authoritative catalog snapshots and atomically saves the inquiry, conversation, optional `<inquiryId>-initial` Customer message, access credential and outbox. Notes are optional. Preserve all writes and contracts.
- Customer history and SSE share the hardened safe projection. The reducer merges by ID and durable position and preserves locally acknowledged messages. Keep those mechanisms intact.
- Product options currently have name/SKU/units only; extend the explicit public projection with existing primary images and descriptions. Never pass internal prices.
- Add a separate cookie-authenticated, no-store summary read using the existing repository. Return only requested products/quantities, destination, submitted notes/date and the initial message identity. Suppress that exact Customer message only when its notes are present in the summary; never delete history.
- Keep the existing route and replace the completed form with chat. Offer an explicit new-inquiry action for resumed conversations. Do not persist private drafts in browser storage.
- Use existing stone/olive tokens, image-led accessible selection, open form sections, compact request summary, bounded message viewport, growing composer and CSS motion with reduced-motion support.
- Scroll controller operates on message identities independently of the reducer: 96px near-bottom threshold, no initial animated jump, preserve the first visible message during repaired insertion, count unseen IDs and follow resize only while at bottom.

## Validation plan

Focused summary authorization/projection, selection, presentation and scroll behavior tests; existing history/SSE/translation suites; lint, typecheck, full unit suite, guarded disposable PostgreSQL integration, db check, build and whitespace check. Rendered browser review on mobile RTL/LTR and desktop; report device limitations precisely.

No schema/migration, dependency, Staff UI, translation policy, provider, Git staging/commit/push or branch changes.

## Implementation report

1. **Resumed state:** branch remained `feature/inquiry-chat-redesign`. The original baseline was clean; the continuation found three modified tracked files and eleven new files from this task. The rejected multi-file patch had not applied. Nothing was reverted or restarted.
2. **Partial work:** summary DTO/use case/route/composition/client, the scroll controller, product picker, form changes and nine passing initial tests existed. Chat components, locale wiring, integration and final validation were incomplete.
3. **Repairs:** completed props and four-locale labels, repaired a missing JSX closing tag, retained validated timestamps in expected client results, replaced a stale CSS assertion with accessible send-button behavior, fixed restoration while summary loading, and separated history retry cleanup from active message sending. Removed the superseded selector UI. Limited JSON formatting changes to the four affected namespaces.
4. **Inquiry UX:** the existing static localized route now has a restrained intro, bounded content width and open sections using existing stone/olive tokens. Contact fields retain required, conditional-channel and validation semantics; explanatory text and explicit consent wording clarify their purpose.
5. **Products:** reusable image-led keyboard-accessible toggle buttons use `aria-pressed`, visible checkmarks, real catalog images/descriptions and a missing/broken-image fallback. Selection uses the existing reducer. Quantity rows retain exact pallet/package rules; removal from a quantity row returns focus to its selector.
6. **Destination:** neutral destination wording explains commercial context once and states buyer-arranged collection/transport. Existing optional country/city validation is preserved; no freight or delivery behavior was introduced.
7. **Additional details:** remain optional request context. The submitted payload and domain persistence are unchanged.
8. **Transition:** success replaces the completed form with chat within the same route, focuses the success announcement, and preserves secure cookie restoration. An explicit new-inquiry action returns to the form. It does not erase the existing conversation or cookie; refresh resumes the current cookie's conversation until another inquiry succeeds.
9. **Summary:** new cookie-authenticated `GET /api/customer/conversation/summary` derives identity exclusively from validated access, applies existing Origin/rate-limit conventions, and returns `Cache-Control: no-store`. An explicit application projection exposes only submitted products/quantities, destination, notes/date and the initial-message identity. No contacts, operational statuses, private pricing or provider data are returned.
10. **Initial notes:** the summary carries the server-derived identity from the established `<inquiryId>-initial` persistence convention. Only that exact Customer message is omitted from the timeline while its notes are in the summary. Equal-text follow-ups remain visible. History is not deleted or mutated. If summary loading fails, history remains visible and summary retry is available.
11. **Chat layout:** compact header, native collapsible summary with bounded expanded content, message viewport, connection/typing feedback and bottom composer. No internal inquiry/database reference is rendered as a customer heading.
12. **Messages:** logical own/reply alignment, restrained bubbles, authored `dir="auto"` text, long-token wrapping, localized authoritative timestamps and unified YOLPOL authorship. Existing acknowledged-message identity is retained through SSE persistence/replay.
13. **Composer:** growing textarea capped at 160px, 44px send target, bottom safe-area padding, sticky positioning, readonly in-flight draft, empty-send prevention and existing synchronous duplicate-send guard. Desktop Enter sends, Shift+Enter adds a line; mobile Enter and IME composition remain text entry. Native virtual-keyboard behavior is not manually verified.
14. **Smart scrolling:** presentation-only controller with a 96px near-bottom threshold. New unique IDs follow smoothly at the bottom; initial history positions the internal viewport without animation, and does not pull a reader who already scrolled. Repaired earlier insertion restores the visible message's offset. Resize follows only at the bottom. Smooth-scroll progress is distinguished from reader intervention. Observers/listeners are cleaned up.
15. **Indicator:** counts unique unseen IDs while reading above; deduplicated acknowledgements/replays do not increase the count. Clicking scrolls to latest and clears the count; reaching the bottom clears it too. No horizontal/RTL scroll calculations are used.
16. **Motion:** small CSS fade/vertical reveals, selected/pressed/focus transitions, subtle image hover, summary chevron and new-message entry. Reduced-motion disables animation/transforms and uses immediate scrolling. No motion dependency was added.
17. **Mobile:** fluid controls, wrapping contact options, one-column mobile product layout, bounded message content, dynamic viewport height and safe-area composer spacing. Actual 320/360/390/430px overflow, touch behavior and keyboard geometry remain unverified.
18. **RTL/LTR:** logical spacing/corners, mirrored directional icons, isolated SKU/quantity/time content, and automatic direction for authored text. HTTP checks confirm correct locale direction for all four inquiry routes.
19. **Accessibility:** semantic form groups, associated labels/errors, visible consent, accessible pressed state, preserved focus after removal, named send/summary/indicator controls, scroll-region keyboard focus, status/error announcements and reduced-motion support.
20. **Copy:** updated only `InquiryPage`, `InquiryProductSelection`, `InquirySubmission`, and `CustomerChat` in en/tr/fa/ar. Catalog content remains authoritative and separate from interface copy.
21. **Sensitive changes:** no server delivery projection, translation policy, held frontier, SSE cursor/replay implementation, message reducer, submission API or persistence write was changed. Existing client parser now preserves already-validated `createdAt`; EventSource adds optional open/error observers without reconnect ownership changes. CustomerChat lifecycle supports summary reads and independent history retry. The new authenticated summary boundary should be included in any independent targeted audit. Staff UI/Translation Control and AI fact grounding are untouched.
22. **Files/dependencies:** exact changed/new file inventory is recorded below. No dependency, schema, migration, secret or generated asset was added.
23. **Tests:** new summary projection and authorization suites, selector/summary/localization/bidi/IME tests, and nine scroll cases. Existing history/SSE timestamp assertions and restored-chat presentation tests were updated. Existing ordering, optimistic acknowledgement, replay, translation and AI safety tests remain intact.
24. **Validation:** full unit suite 197 files / 2,098 tests passed; guarded disposable PostgreSQL suite 12 files / 177 tests passed; lint passed; typecheck passed; Drizzle check passed; final production build passed with 109 generated pages. The focused suite passed 286 tests before the final anchor case; the final nine-case scroll suite and full unit suite include that case. Initial Drizzle ENOMEM and Docker access errors were resolved through approved execution outside the sandbox. The integration runner cleaned up only its disposable test container and did not delete named volumes or development data.
25. **Rendered review:** the browser tool reported no available browsers. No screenshots, manual browser interaction or visual-quality acceptance is claimed. Read-only HTTP checks against the existing port-3000 server returned 200 for en/tr/fa/ar, one H1, correct direction and no `internalUnitPrice` in the rendered HTML. A requested port-3100 dev server exited after detecting the existing user-owned dev server; that server was left untouched.
26. **Remaining risks:** visual acceptance of Arabic/English mobile and desktop Inquiry/Chat; 320-430px geometry; real iOS/Android keyboard and safe areas; browser-level scroll/resize/animation behavior; end-to-end inquiry submission with live Customer/Staff conversation. No real provider or Telegram communication was exercised. A connected browser was requested during work.
27. **Git state:** 23 tracked files modified and 14 new files, all unstaged. No commit, push, branch switch or unrelated reset/revert occurred. Exact status follows.
28. **Diff size:** `git diff --stat` below describes tracked files only; new files are separately listed by status because ordinary diff does not include them.
29. **Whitespace:** `git diff --check` passed. A separate scan also checked all changed and untracked text files for trailing whitespace.

**Verdict: PASS WITH FIXES for implementation and automated validation. Rendered visual acceptance remains pending; the feature is not claimed fully visually verified.**


## Final validation commands

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: 197 files, 2,098 tests |
| `pnpm test:integration` | PASS: 12 files, 177 tests; approved sandbox escalation |
| `pnpm db:check` | PASS; approved sandbox escalation |
| `pnpm build` | PASS: 109 pages; inquiry routes remain static |
| `git diff --check` | PASS |
| Changed/untracked whitespace scan | PASS: all 37 files |
| Rendered browser/device review | NOT PERFORMED: no browser connected |

## Exact final file inventory: git status --short --untracked-files=all

```text
 M src/app/[locale]/inquiry/page.tsx
 M src/app/globals.css
 M src/composition/inquiries/inquiry-presentation.ts
 M src/features/inquiries/presentation/__tests__/customer-chat-presentation.test.tsx
 M src/features/inquiries/presentation/__tests__/customer-conversation-stream-client.test.ts
 M src/features/inquiries/presentation/__tests__/customer-message-client.test.ts
 M src/features/inquiries/presentation/__tests__/inquiry-presentation.test.tsx
 M src/features/inquiries/presentation/clients/customer-conversation-stream-client.ts
 M src/features/inquiries/presentation/clients/customer-message-client.ts
 M src/features/inquiries/presentation/components/customer-chat/chat-container.tsx
 M src/features/inquiries/presentation/components/customer-chat/chat-loading-state.tsx
 M src/features/inquiries/presentation/components/customer-chat/customer-chat.tsx
 M src/features/inquiries/presentation/components/customer-chat/message-input.tsx
 M src/features/inquiries/presentation/components/customer-chat/message-item.tsx
 M src/features/inquiries/presentation/components/customer-chat/message-list.tsx
 M src/features/inquiries/presentation/components/inquiry-form.tsx
 M src/features/inquiries/presentation/components/inquiry-page.tsx
 M src/features/inquiries/presentation/view-models/customer-chat-view-model.ts
 M src/features/inquiries/presentation/view-models/inquiry-form-view-model.ts
 M src/i18n/messages/ar.json
 M src/i18n/messages/en.json
 M src/i18n/messages/fa.json
 M src/i18n/messages/tr.json
?? docs/tasks/0047-inquiry-chat-redesign.md
?? src/app/api/customer/conversation/summary/route.ts
?? src/composition/inquiries/customer-inquiry-summary-http.ts
?? src/features/inquiries/application/__tests__/get-customer-inquiry-summary.test.ts
?? src/features/inquiries/application/dto/customer-inquiry-summary-dto.ts
?? src/features/inquiries/application/use-cases/get-customer-inquiry-summary.ts
?? src/features/inquiries/infrastructure/__tests__/customer-inquiry-summary-http.test.ts
?? src/features/inquiries/infrastructure/http/customer-inquiry-summary-request-handler.ts
?? src/features/inquiries/presentation/__tests__/inquiry-chat-redesign.test.tsx
?? src/features/inquiries/presentation/clients/customer-inquiry-summary-client.ts
?? src/features/inquiries/presentation/components/customer-chat/inquiry-summary.tsx
?? src/features/inquiries/presentation/components/inquiry-product-picker.tsx
?? src/features/inquiries/presentation/state/__tests__/customer-chat-scroll.test.ts
?? src/features/inquiries/presentation/state/customer-chat-scroll.ts
```

## git diff --stat

```text
 src/app/[locale]/inquiry/page.tsx                  |   3 +-
 src/app/globals.css                                |  25 +++++
 src/composition/inquiries/inquiry-presentation.ts  |   5 +-
 .../__tests__/customer-chat-presentation.test.tsx  |   4 +-
 .../customer-conversation-stream-client.test.ts    |  14 ++-
 .../__tests__/customer-message-client.test.ts      |   4 +-
 .../__tests__/inquiry-presentation.test.tsx        |   2 +-
 .../clients/customer-conversation-stream-client.ts |  10 +-
 .../clients/customer-message-client.ts             |   2 +-
 .../components/customer-chat/chat-container.tsx    |  10 +-
 .../customer-chat/chat-loading-state.tsx           |   4 +-
 .../components/customer-chat/customer-chat.tsx     |  48 ++++++--
 .../components/customer-chat/message-input.tsx     |  34 ++++--
 .../components/customer-chat/message-item.tsx      |  11 +-
 .../components/customer-chat/message-list.tsx      |  72 +++++++++++-
 .../presentation/components/inquiry-form.tsx       |  77 +++++++------
 .../presentation/components/inquiry-page.tsx       |  12 +-
 .../view-models/customer-chat-view-model.ts        |   4 +
 .../view-models/inquiry-form-view-model.ts         |   3 +-
 src/i18n/messages/ar.json                          | 124 ++++++++++++++++++++-
 src/i18n/messages/en.json                          | 124 ++++++++++++++++++++-
 src/i18n/messages/fa.json                          | 124 ++++++++++++++++++++-
 src/i18n/messages/tr.json                          | 124 ++++++++++++++++++++-
 23 files changed, 742 insertions(+), 98 deletions(-)
```
