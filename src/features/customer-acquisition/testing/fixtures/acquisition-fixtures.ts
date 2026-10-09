export function syntheticObservation(overrides: Record<string, unknown> = {}) {
  return {synthetic: true, idempotencyKey: "synthetic-observation-1", company: {name: "Synthetic Olive Bottler", country: "TR", domain: "bottler.example"},
    segment: "tr-olive-oil-v1", source: {system: "synthetic-manual", recordId: "company-1", url: "https://bottler.example/about", observedAt: "2026-10-08T00:00:00.000Z", runReference: "manual-1"}, ...overrides};
}
