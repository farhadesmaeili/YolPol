import {isSupportedLocale, type Locale} from "@/shared/types/locale";

export type TranslationRemediation = Readonly<{expectedVersion: number}> & (
  | Readonly<{action: "RETRY"; targetLocale: Locale}>
  | Readonly<{action: "SKIP"}>
  | Readonly<{action: "CONFIRM_LANGUAGE"; sourceLocale: Locale}>
);

export function parseTranslationRemediation(value: unknown): TranslationRemediation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row: Record<string, unknown> = {...value};
  if (!Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1) return null;
  const expectedVersion = Number(row.expectedVersion);
  const keys = Object.keys(row).sort().join(",");
  if (row.action === "SKIP" && keys === "action,expectedVersion") return {action: "SKIP", expectedVersion};
  if (row.action === "RETRY" && keys === "action,expectedVersion,targetLocale" && typeof row.targetLocale === "string" && isSupportedLocale(row.targetLocale)) return {action: "RETRY", expectedVersion, targetLocale: row.targetLocale};
  if (row.action === "CONFIRM_LANGUAGE" && keys === "action,expectedVersion,sourceLocale" && typeof row.sourceLocale === "string" && isSupportedLocale(row.sourceLocale)) return {action: "CONFIRM_LANGUAGE", expectedVersion, sourceLocale: row.sourceLocale};
  return null;
}
