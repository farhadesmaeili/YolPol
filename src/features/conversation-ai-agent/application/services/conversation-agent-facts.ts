import type {ConversationAgentFact, ConversationAgentResponseCopy, PublicConversationAgentProduct} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";

export function productFacts(product: PublicConversationAgentProduct, copy: ConversationAgentResponseCopy, index: number): readonly ConversationAgentFact[] {
  const identity = `${copy.product}: ${product.name} (${copy.sku}: ${product.sku})`;
  const facts: ConversationAgentFact[] = [{id: `product_${index}.identity`, sourceKey: `product:${product.id}:identity`, text: identity}];
  const add = (field: string, label: string, value: string | number | undefined) => {
    if (value !== undefined) facts.push({id: `product_${index}.${field}`, sourceKey: `product:${product.id}:${field}`, text: `${identity}\n${label}: ${value}`});
  };
  const specs = product.specifications;
  add("capacityMl", copy.capacityMl, specs.capacityMl);
  add("glassColor", copy.glassColor, specs.glassColor === undefined ? undefined : copy.colors[specs.glassColor]);
  add("bottleShape", copy.bottleShape, specs.bottleShape === undefined ? undefined : copy.shapes[specs.bottleShape]);
  add("neckFinish", copy.neckFinish, specs.neckFinish);
  add("weightGrams", copy.weightGrams, specs.weightGrams);
  add("heightMm", copy.heightMm, specs.heightMm);
  add("diameterMm", copy.diameterMm, specs.diameterMm);
  if (product.packaging) {
    const packaging = product.packaging;
    add("unitsPerPackage", copy.unitsPerPackage, packaging.unitsPerPackage);
    add("packagesPerPallet", copy.packagesPerPallet, packaging.packagesPerPallet);
    add("unitsPerPallet", copy.unitsPerPallet, packaging.unitsPerPallet);
    add("palletGrossWeightKg", copy.palletGrossWeightKg, packaging.palletGrossWeightKg);
    add("referenceLoadPallets", copy.referenceLoadPallets, packaging.referenceLoadPallets);
    add("unitsPerReferenceLoad", copy.unitsPerReferenceLoad, packaging.unitsPerReferenceLoad);
  }
  return Object.freeze(facts.map((fact) => Object.freeze(fact)));
}

// Model output can select issued facts, but can supply no text or factual values.
export function renderConversationAgentAnswer(content: string, observations: ReadonlyMap<string, readonly ConversationAgentFact[]>): string | null {
  if (content.length > 8_000) return null;
  let plan: unknown;
  try { plan = JSON.parse(content); } catch { return null; }
  if (!isRecord(plan) || Object.keys(plan).length !== 2 || plan.type !== "GROUNDED" || !Array.isArray(plan.facts) || plan.facts.length < 1 || plan.facts.length > 12) return null;
  const selected: string[] = [];
  const references = new Set<string>();
  for (const reference of plan.facts) {
    if (!isRecord(reference) || Object.keys(reference).length !== 2 || typeof reference.observationId !== "string" || typeof reference.factId !== "string") return null;
    const key = `${reference.observationId}:${reference.factId}`;
    if (references.has(key)) return null;
    references.add(key);
    const fact = observations.get(reference.observationId)?.find(({id}) => id === reference.factId);
    if (!fact || fact.text.trim().length === 0) return null;
    selected.push(fact.text);
  }
  const body = selected.join("\n\n");
  return body.length <= 8_000 ? body : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
