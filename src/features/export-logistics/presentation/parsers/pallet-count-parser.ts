export type PalletCountParseResult =
  | Readonly<{status: "valid"; value: number}>
  | Readonly<{status: "invalid"}>;

// Leading zeroes are prohibited so every accepted value has one canonical form.
export function parsePalletCount(rawValue: string): PalletCountParseResult {
  if (!/^[1-9][0-9]*$/u.test(rawValue)) return {status: "invalid"};
  const value = Number.parseInt(rawValue, 10);
  return Number.isSafeInteger(value) && value > 0
    ? Object.freeze({status: "valid", value})
    : Object.freeze({status: "invalid"});
}
