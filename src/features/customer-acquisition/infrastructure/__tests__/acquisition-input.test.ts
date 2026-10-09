import {describe, expect, it} from "vitest";
import {parseObservation, parseQualification, parseSuppression} from "@/features/customer-acquisition/infrastructure/validation/acquisition-input";
import {syntheticObservation} from "@/features/customer-acquisition/testing/fixtures/acquisition-fixtures";

describe("strict synthetic acquisition input", () => {
  it("parses a bounded observation and unverified synthetic contact", () => {
    const result = parseObservation(syntheticObservation({contact: {name: "Synthetic Contact", email: " Test@Bottler.Example "}}));
    expect(result.contact?.normalizedEmail).toBe("Test@bottler.example"); expect(result.source.system).toBe("synthetic-manual");
  });
  it.each(["price", "internalUnitPrice", "supplierCost", "password", "credentials", "arbitrary"])("rejects unknown %s fields at every boundary", (field) => {
    const input = syntheticObservation();
    expect(() => parseObservation({...input, [field]: 1})).toThrow();
    expect(() => parseObservation({...input, company: {...input.company, [field]: 1}})).toThrow();
    expect(() => parseObservation({...input, source: {...input.source, [field]: 1}})).toThrow();
    expect(() => parseObservation({...input, contact: {name: "Synthetic", email: "x@bottler.example", [field]: 1}})).toThrow();
  });
  it("rejects real data destinations and malformed provenance", () => {
    const input = syntheticObservation();
    for (const value of [{synthetic: false}, {company: {...input.company, domain: "company.com"}}, {contact: {name: "Test", email: "test@gmail.com"}},
      {source: {...input.source, url: "https://company.com"}}, {source: {...input.source, url: "https://x.example/?token=x"}},
      {source: {...input.source, observedAt: "yesterday"}}]) expect(() => parseObservation({...input, ...value})).toThrow();
  });
  it("rejects unknown scoring policy, facts and suppression input", () => {
    expect(() => parseQualification({idempotencyKey: "q1", leadId: "00000000-0000-0000-0000-000000000001", policyVersion: "commercial-v1", facts: {marketMatch: true, segmentMatch: true, packagingRelevance: true}})).toThrow();
    expect(() => parseSuppression({idempotencyKey: "s1", kind: "DOMAIN", target: "example.com", reason: "TEST_OPT_OUT", sourceReference: "test", price: 4})).toThrow();
  });
});
