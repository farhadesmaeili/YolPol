# Staging deployment failures: v0.1.10 through v0.1.12

## Outcome

The three authenticated Staging transactions reached application activation and then failed at `public-smoke-staging`. Automatic rollback restored the previously active v0.1.7 runtime each time. No migration ran because the active and target migration fingerprints were identical. Production was not changed.

Affected GitHub Deployments:

- v0.1.10: `6617639430`
- v0.1.11: `6619957147`
- v0.1.12: `6623545462`

## Root cause

The public smoke primitive received successful HTTPS responses with the required `X-Robots-Tag: noindex, nofollow, noarchive` header. It nevertheless rejected the response because its GNU `grep -E` expression used `\r` as if it represented the carriage-return byte. In an extended regular expression, that escape matches the letter `r`; it does not normalize HTTP CRLF line endings.

The fix removes carriage returns with `tr` before applying a fixed, case-insensitive, whole-line comparison. This preserves the exact header-value contract and continues rejecting missing, partial, or extended values.

## Diagnostic gap

The VPS trusted bootstrap source and installed release controller were still the v0.1.10 bytes during the v0.1.12 attempt. That controller overwrote the transaction phase with `rolled-back` without retaining a closed failure stage, so the ledger and GitHub Deployment status contained only the generic rollback result. The repository's v0.1.12 controller already preserves `failureStage` and `failureDisposition`, but those reviewed bytes must be installed on the VPS before retrying.

The VPS deployment journals and ledger remain incident evidence and must not be edited or deleted. Installing the updated managed contracts must use the existing trusted-source `refresh-contracts` procedure and its validation gates.
