# Conversation translation live delivery correction

## Outcome

Website Customer history and SSE must expose the same content-safe projection.
Customer-authored originals remain visible, translated Staff replies become visible
after their required translation succeeds, and no Staff source-language body is
ever used as an outbound fallback.

## Live root cause

Migration 0018 intentionally backfilled historical Staff and AI message language as
unknown. The Customer reader treated the earliest such row as a permanent global
delivery barrier. In a long-lived Development Conversation, that historical barrier
preceded a newly accepted Turkish Customer message and a successful Persian-to-
Turkish Staff translation, so both safe later messages were omitted by history and
SSE.

## Corrected projection rules

- Customer messages use their persisted original body.
- SYSTEM and unknown-language non-Customer bodies are withheld and form durable
  gaps, but they do not suppress unrelated later Customer-safe content.
- A known cross-language Staff or AI message in PENDING, RUNNING, FAILED, or
  CANCELLED state remains an ordering barrier. Earlier safe content remains visible.
- A successful required translation is projected at the original message position.
- Same-language Staff and AI messages use the original body without provider work.
- SKIPPED messages remain omitted and do not block later safe content.
- History and SSE use the same reader and projection.

Migration 0018 is unchanged. No Development write or provider execution is part of
this correction.

## Deferred translation control

The next feature should add a per-Conversation `AUTO | MANUAL` translation mode with
a separately configurable global default. `AUTO` keeps current scheduling. `MANUAL`
does not schedule provider-backed jobs automatically, exposes Customer originals to
Staff, permits an authorized per-message Translate action, withholds cross-language
Staff originals, and allows same-language Staff originals directly. Mode changes
must be server-authorized, versioned, audited without message content, and must not
be coupled to AI response routing.

## Validation

- Focused unit/presentation: 6 files, 42 tests passed.
- Disposable PostgreSQL integration: 11 files, 117 tests passed; the guarded
  harness removed its tmpfs container afterward.
- Full unit suite: 177 files, 1,854 tests passed.
- Lint, typecheck, production build, and Drizzle snapshot check passed.
- No live provider call, Development write, migration, staging, commit, or push.
