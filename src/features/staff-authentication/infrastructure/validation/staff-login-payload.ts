export type StaffLoginPayload = Readonly<{email: string; password: string}>;

export function parseStaffLoginPayload(value: unknown): StaffLoginPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "email" || keys[1] !== "password") return null;
  if (typeof record.email !== "string" || record.email.length < 1 || record.email.length > 1_024) return null;
  if (typeof record.password !== "string" || record.password.length < 1 || record.password.length > 1_024) return null;
  return Object.freeze({email: record.email, password: record.password});
}

