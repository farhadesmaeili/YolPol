import {AcquisitionValidationError} from "@/features/customer-acquisition/domain/types/acquisition-types";

export function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f<>]/u.test(value)) throw new AcquisitionValidationError();
  const normalized = value.trim().normalize("NFC");
  // Preserve the existing UTF-16 cap on input and final text. It is conservative
  // relative to PostgreSQL character counts, including supplementary characters.
  if (!normalized || normalized.length > maximum) throw new AcquisitionValidationError();
  return normalized;
}

export function companyNameKey(value: string): string {
  const key = boundedText(value, 160).toLowerCase();
  if (key.length > 160) throw new AcquisitionValidationError();
  return key;
}

export function identifier(value: unknown): string {
  const result = boundedText(value, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(result)) throw new AcquisitionValidationError();
  return result;
}

export function countryCode(value: unknown): string {
  const result = boundedText(value, 2).toUpperCase();
  if (!/^[A-Z]{2}$/u.test(result)) throw new AcquisitionValidationError();
  // Syntax is generic; market selection is a separately versioned business policy.
  return result;
}

export function segmentKey(value: unknown): string {
  const result = boundedText(value, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result)) throw new AcquisitionValidationError();
  return result;
}

export function normalizeDomain(value: unknown): string {
  const input = boundedText(value, 253);
  if (/[\s/@:#?%\\]/u.test(input)) throw new AcquisitionValidationError();
  let host: string;
  try { host = new URL(`https://${input}`).hostname.toLowerCase().replace(/\.$/u, ""); }
  catch { throw new AcquisitionValidationError(); }
  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2 || !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) || /^\d+(?:\.\d+){3}$/u.test(host)) throw new AcquisitionValidationError();
  return host;
}

export function requireSyntheticDomain(domain: string): string {
  if (!(domain.endsWith(".test") || domain.endsWith(".example") || /^(?:[a-z0-9-]+\.)*example\.(com|org|net)$/u.test(domain))) throw new AcquisitionValidationError();
  return domain;
}

export function normalizeEmail(value: unknown): Readonly<{original: string; normalized: string}> {
  const original = boundedText(value, 254);
  const parts = original.split("@");
  const local = parts[0];
  if (parts.length !== 2 || local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u.test(local)) throw new AcquisitionValidationError();
  const normalized = `${local}@${normalizeDomain(parts[1])}`;
  if (normalized.length > 254) throw new AcquisitionValidationError();
  return Object.freeze({original, normalized});
}

export function sourceUrl(value: unknown): string {
  const input = boundedText(value, 1024);
  let url: URL;
  try { url = new URL(input); } catch { throw new AcquisitionValidationError(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) throw new AcquisitionValidationError();
  url.hostname = requireSyntheticDomain(normalizeDomain(url.hostname));
  const normalized = url.toString();
  if (normalized.length > 1024) throw new AcquisitionValidationError();
  return normalized;
}

export function observationTime(value: unknown): string {
  const result = boundedText(value, 24);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) throw new AcquisitionValidationError();
  return result;
}
