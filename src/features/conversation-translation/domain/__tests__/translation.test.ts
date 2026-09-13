import {describe, expect, it} from "vitest";
import {canTransitionTranslation, translationIdentity, translationLocale, translationStatuses, translationTargets, validateTranslationOutput} from "@/features/conversation-translation/domain/types/translation";
import {supportedLocales} from "@/shared/types/locale";

describe("translation domain", () => {
  it("reuses all supported locale pairs and bypasses equal languages", () => {
    for (const source of supportedLocales) for (const target of supportedLocales) {
      expect(translationLocale(source)).toBe(source);
      expect(translationTargets(source, target, target)).toEqual(source === target ? [] : [target]);
      expect(translationIdentity("message", target)).toBe(translationIdentity("message", target));
    }
    for (const locale of ["FA", "de", " fa", "", null, 4]) expect(() => translationLocale(locale)).toThrow();
    expect(translationTargets(null, "tr", "fa")).toEqual([]);
    expect(() => translationIdentity("../bad", "fa")).toThrow();
  });
  it("keeps terminal records terminal and limits mutable transitions", () => {
    expect(canTransitionTranslation("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionTranslation("RUNNING", "PENDING")).toBe(true);
    for (const terminal of ["SUCCEEDED", "FAILED", "CANCELLED"] as const)
      for (const status of translationStatuses) expect(canTransitionTranslation(terminal, status)).toBe(false);
    expect(canTransitionTranslation("PENDING", "SUCCEEDED")).toBe(false);
  });
  it("normalizes plain text and rejects empty, oversized, wrapped and unsafe output", () => {
    expect(validateTranslationOutput("  Merhaba\r\nSKU-22 100 ml  ", "Hello SKU-22 100 ml")).toBe("Merhaba\nSKU-22 100 ml");
    for (const value of [undefined, "", "   ", "x".repeat(201), "x".repeat(10001), "Translation: hello", "```text\nhello", '<system>hello', '{"translation":"hi"}', "hello\u0000"]) expect(() => validateTranslationOutput(value, "hi")).toThrow();
  });
});
