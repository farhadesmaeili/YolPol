import {describe, expect, it} from "vitest";
import {boundedText, companyNameKey, countryCode, normalizeDomain, normalizeEmail, requireSyntheticDomain, segmentKey, sourceUrl} from "@/features/customer-acquisition/domain/value-objects/acquisition-values";
import {AcquisitionValidationError} from "@/features/customer-acquisition/domain/types/acquisition-types";
import {scoreFoundation} from "@/features/customer-acquisition/domain/services/foundation-scoring";

describe("acquisition value policies", () => {
  describe("ACQ-01 final Unicode bounds", () => {
    it("rejects NFC expansion beyond the storage bound", () => {
      expect(() => boundedText("\u0344".repeat(160), 160)).toThrow(AcquisitionValidationError);
      expect(boundedText("\u0344".repeat(80), 160)).toBe("\u0308\u0301".repeat(80));
    });
    it("independently bounds lowercase company keys without truncation", () => {
      expect(() => companyNameKey("\u0130".repeat(160))).toThrow(AcquisitionValidationError);
      expect(companyNameKey("\u0130".repeat(80))).toBe("i\u0307".repeat(80));
      expect(() => companyNameKey(`${"\u0130".repeat(80)}A`)).toThrow(AcquisitionValidationError);
    });
    it("preserves mixed canonical Unicode and exact ASCII boundaries", () => {
      expect(boundedText(" Cafe\u0301 \u0130 \u{1f600} ", 160)).toBe("Caf\u00e9 \u0130 \u{1f600}");
      expect(companyNameKey("Cafe\u0301 \u0130 \u{1f600}")).toBe("caf\u00e9 i\u0307 \u{1f600}");
      expect(companyNameKey("A".repeat(160))).toBe("a".repeat(160));
      expect(() => companyNameKey("A".repeat(161))).toThrow(AcquisitionValidationError);
    });
    it("retains the conservative UTF-16 input and final-value limits", () => {
      expect(boundedText("\u{1f600}".repeat(80), 160)).toBe("\u{1f600}".repeat(80));
      expect(() => boundedText("\u{1f600}".repeat(81), 160)).toThrow(AcquisitionValidationError);
      expect(() => boundedText("e\u0301".repeat(81), 160)).toThrow(AcquisitionValidationError);
      expect(() => boundedText(`${"Q".repeat(159)}\u0344`, 160)).toThrow(AcquisitionValidationError);
    });
  });
  it("normalizes IDNA and trailing dots without merging subdomains", () => {
    expect(normalizeDomain("BÜCHER.Example.")).toBe("xn--bcher-kva.example");
    expect(normalizeDomain("bottles.bottler.example")).toBe("bottles.bottler.example");
    expect(normalizeDomain("producer.co.uk")).toBe("producer.co.uk");
  });
  it.each(["127.0.0.1", "localhost", "evil.example/path", "user@host.example", "https://host.example", "foo..example", "foo.example:80", "-bad.example", "foo.example..", "foo%2eexample"])("rejects unsafe domain %s", (value) => expect(() => normalizeDomain(value)).toThrow());
  it("preserves local-part case and original email representation", () => {
    expect(normalizeEmail(" User.Name@BÜCHER.Example ")).toEqual({original: "User.Name@BÜCHER.Example", normalized: "User.Name@xn--bcher-kva.example"});
    expect(normalizeEmail("User@example.test").normalized).not.toBe(normalizeEmail("user@example.test").normalized);
  });
  it.each(["a..b@x.example", "a@b@x.example", "a b@x.example", '"a"@x.example', "é@x.example", "a@localhost"])("rejects ambiguous email %s", (value) => expect(() => normalizeEmail(value)).toThrow());
  it("validates country syntax and generic segment identity", () => {
    expect(countryCode("tr")).toBe("TR"); expect(segmentKey("ae-food-v2")).toBe("ae-food-v2");
    expect(() => countryCode("Turkey")).toThrow(); expect(() => segmentKey("TR olive")).toThrow();
    expect(requireSyntheticDomain("company.test")).toBe("company.test");
    expect(() => requireSyntheticDomain("company.com")).toThrow();
  });
  it("scores all bounded combinations with suppression taking precedence", () => {
    for (const marketMatch of [true, false]) for (const segmentMatch of [true, false]) for (const packagingRelevance of [true, false]) {
      const facts = {marketMatch, segmentMatch, packagingRelevance};
      const result = scoreFoundation(facts, false);
      expect(result.score).toBe((marketMatch ? 30 : 0) + (segmentMatch ? 40 : 0) + (packagingRelevance ? 30 : 0));
      expect(scoreFoundation(facts, true).decision).toBe("BLOCKED");
    }
  });
  it("bounds the serialized source URL after Unicode percent encoding", () => {
    expect(() => sourceUrl(`https://bottler.example/${"\u00e9".repeat(200)}`)).toThrow();
    expect(sourceUrl("https://BOTTLER.EXAMPLE/about")).toBe("https://bottler.example/about");
  });
});
