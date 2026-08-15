import {describe, expect, it} from "vitest";
import {parsePalletCount} from "@/features/export-logistics/presentation/parsers/pallet-count-parser";

describe("parsePalletCount", () => {
  it.each(["1", "2", "26", "100"])("accepts canonical positive decimal %s", (input) => expect(parsePalletCount(input)).toEqual({status: "valid", value: Number.parseInt(input, 10)}));
  it.each(["", " ", " 1", "1 ", "0", "-1", "+1", "1.0", "1.5", "1e2", "01", "NaN", "Infinity", "١", "۱۲", "1x", "9007199254740992"])("rejects non-canonical input %j", (input) => expect(parsePalletCount(input)).toEqual({status: "invalid"}));
  it.each(["1\u0000", "1\n", "1\r", "1\t", "1\u200b", "1\u2028", "1\u2029"])("rejects hidden or control input %j", (input) => expect(parsePalletCount(input)).toEqual({status: "invalid"}));
});
