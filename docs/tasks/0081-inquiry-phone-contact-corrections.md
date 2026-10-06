# Task 0081: Inquiry Phone UX and Contact Information Corrections

## Purpose and starting state

Task 0081 corrects local-phone handling on the public Inquiry form, makes the accepted format understandable and accessible in all four locales, corrects the Persian and Arabic spelling of Tarasht, and visually distinguishes the public Instagram and Telegram channels on Contact.

Repository work started from the required clean state:

- branch: `fix/inquiry-phone-contact-corrections`;
- HEAD: `e8f33d81ee48278c099e21323c75170303478805`;
- protected stash: `stash@{0}: On feature/conversation-ai-continuation: wip: conversation ai continuation experiment`.

The protected stash was not applied, popped, dropped, rewritten, or otherwise modified.

## Inquiry phone policy

New Inquiry submissions validate the customer location country before normalizing the main phone or WhatsApp phone. Both fields use that same customer country as the default for an unprefixed local number; the optional destination country is never used for phone interpretation.

The domain owns a complete `TargetCountryCode` to calling-code mapping. For an unprefixed value, normalization accepts only the existing safe formatting characters, removes them, removes at most one leading national trunk `0`, avoids duplicating the selected country's calling code when already present, and otherwise prepends that calling code. The canonical result remains `+<international digits>` and must satisfy the generic 7-15 digit E.164-style boundary with a non-zero first digit.

An explicit leading `+` always takes precedence over the selected customer country. The implementation does not infer a different country from unprefixed digits, add `00` dialing-prefix support, perform carrier-specific validation, or introduce a numbering-plan database or third-party phone library.

Examples:

- Iran: `09123320541`, `9123320541`, `989123320541`, `+989123320541`, and `0912 332 0541` all canonicalize to `+989123320541` when the customer country is `IR`;
- Turkey: `05321234567`, `5321234567`, `905321234567`, and `+905321234567` canonicalize to `+905321234567` when the customer country is `TR`;
- Iraq: `07701234567`, `7701234567`, `9647701234567`, and `+9647701234567` canonicalize to `+9647701234567` when the customer country is `IQ`;
- customer country `IR` plus explicit `+905321234567` remains `+905321234567`.

The `allowLegacy` reconstitution path retains the previous international-phone fallback and continues to accept historical country strings outside the current target-country set. No persistence or API shape changed.

## Inquiry UX and accessibility

English, Turkish, Persian, and Arabic catalogs now explain that local format follows the selected customer country and that international format can start with `+` and a country calling code. Main-phone and WhatsApp validation messages now accept either policy instead of requiring every value to include a calling code.

Each rendered phone hint has a stable field-specific ID. Each phone input always references its hint through `aria-describedby`; when validation fails, the same attribute contains both the hint ID and error ID. The fields retain `type="tel"`, `inputMode="tel"`, `dir="ltr"`, `autoComplete="tel"`, their mobile touch behavior, and no conflicting HTML `pattern`.

Browser blur normalization uses the selected customer country. Without valid country context, an unprefixed local value remains unchanged; an explicit `+` value can still be safely canonicalized.

## Contact information corrections

The centralized Persian and Arabic office addresses now spell Tarasht as `طرشت`. English and Turkish `Tarasht` values are unchanged. Repository search found the old spelling only in the centralized configuration and its exact-value test, so no historical documentation was rewritten.

Contact continues to consume `publicSocialLinks`. Each public social link now visually pairs the centralized platform label with its centralized handle:

- `Instagram` with `@yolpol.hq`;
- `Telegram` with `@yolpol_hq`.

Localized Contact labels remain the links' accessible `aria-label` values. The existing external-link security attributes, LTR isolation, wrapping, and minimum touch targets remain intact. LinkedIn remains excluded because it is not public.

## Files changed

- `src/features/inquiries/domain/validation/inquiry-input-validation.ts`
- `src/features/inquiries/domain/__tests__/inquiry.test.ts`
- `src/features/inquiries/presentation/parsers/inquiry-draft-mapper.ts`
- `src/features/inquiries/presentation/components/inquiry-form.tsx`
- `src/features/inquiries/presentation/view-models/inquiry-form-view-model.ts`
- `src/features/inquiries/presentation/__tests__/inquiry-presentation.test.tsx`
- `src/app/[locale]/(public)/inquiry/page.tsx`
- `src/i18n/messages/en.json`
- `src/i18n/messages/tr.json`
- `src/i18n/messages/fa.json`
- `src/i18n/messages/ar.json`
- `src/shared/config/site.ts`
- `src/shared/config/site.test.ts`
- `src/shared/presentation/contact/components/contact-page.tsx`
- `src/shared/presentation/contact/__tests__/contact-page.test.ts`
- `docs/tasks/0081-inquiry-phone-contact-corrections.md`

## Validation

- focused Vitest command required by the task: passed, 5 files and 258 tests;
- `pnpm typecheck`: passed;
- `pnpm lint`: passed;
- `pnpm build`: passed with all 81 static pages generated, including all four locale Inquiry routes.
- `git diff --check`: passed;
- stale current public spelling search: no remaining `ترشت` occurrence outside documentation;
- stale international-only phone-error wording search: no remaining occurrence in `src`.

## Non-goals and mutation boundary

This task does not add carrier-specific validation, a full national numbering-plan database, new digit-script handling, `00` prefix handling, a dependency, a database migration, a persistence/API shape change, Product pricing behavior, a dynamic Inquiry route, or a live deployment.

No commit, push, merge, branch switch, stash mutation, database or data mutation, migration, deployment, Production/Staging runtime action, VPS or Windows host access, Docker-volume mutation, secret or credential mutation, DNS change, or Cloudflare change was performed.
