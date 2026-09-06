import {describe, expect, it} from "vitest";

import {CodeOwnedConversationAgentToolRegistry} from "@/features/conversation-ai-agent/application/services/code-owned-conversation-agent-tool-registry";
import {ProductRepositoryConversationAgentCatalog} from "@/features/conversation-ai-agent/infrastructure/repositories/product-repository-conversation-agent-catalog";
import {StaticConversationAgentKnowledgeRepository} from "@/features/conversation-ai-agent/infrastructure/repositories/static-conversation-agent-knowledge-repository";
import {StaticProductRepository} from "@/features/products/infrastructure/repositories/static-product-repository";
import {FakeProductRepository} from "@/features/products/testing/fakes/fake-product-repository";
import {ProductTestBuilder} from "@/features/products/testing/builders/product-test-builder";
import type {ProductRepository} from "@/features/products/application/ports/product-repository";
import {siteConfig} from "@/shared/config/site";
import {parseAiProviderExecutionRequest} from "@/features/ai-provider-gateway/application/use-cases/parse-ai-provider-execution-request";

function registry(repository: ProductRepository = new StaticProductRepository()) {
  const knowledge = new StaticConversationAgentKnowledgeRepository();
  return new CodeOwnedConversationAgentToolRegistry(new ProductRepositoryConversationAgentCatalog(repository), knowledge);
}

describe("Conversation Agent tools", () => {
  it.each(["en", "tr", "fa", "ar"] as const)("keeps the largest catalog observation within the Gateway boundary in %s", async (locale) => {
    const tools = registry();
    const result = await tools.execute({name: "search_products", arguments: "{}", locale});
    const content = JSON.stringify({observationId: "observation_1", facts: result.facts?.map(({id, text}) => ({id, text}))});
    expect(() => parseAiProviderExecutionRequest({executionId: "catalog_bounds", capability: "TOOL_CALLING", requiredCapabilities: ["TOOL_CALLING", "TEXT_GENERATION"], tools: tools.definitions(), messages: [
      {role: "USER", content: "List bottles"},
      {role: "ASSISTANT", content: "", toolCalls: [{id: "call_1", name: "search_products", arguments: "{}"}]},
      {role: "TOOL", toolCallId: "call_1", name: "search_products", content},
    ]})).not.toThrow();
  });

  it.each([
    '{"locale":"xx"}', '{"capacityMl":0}', '{"capacityMl":500.5}', '{"capacityMl":10001}',
    '{"bottleShape":"triangle"}', '{"glassColor":"private"}', '{"category":"private"}',
    '{"__proto__":{"admin":true}}', '{"query":{"sql":"SELECT *"}}', '{"query":["bottle"]}',
    JSON.stringify({query: "x".repeat(121)}), '[]', 'null', '{',
  ])("rejects invalid model arguments before dispatch: %s", (args) => {
    expect(registry().validate({name: "search_products", arguments: args, locale: "en"})).toEqual({valid: false, reason: "INVALID_TOOL_CALL"});
  });

  it("canonicalizes only schema-validated scalar values and refuses model locale overrides", () => {
    const tools = registry();
    const first = tools.validate({name: "search_products", arguments: '{"capacityMl":500,"sku":" ABC "}', locale: "tr"});
    const second = tools.validate({name: "search_products", arguments: '{ "sku":"abc", "capacityMl":5e2 }', locale: "tr"});
    expect(first).toEqual(second);
    expect(first).toMatchObject({valid: true, arguments: '{"capacityMl":500,"sku":"abc"}'});
    expect(tools.validate({name: "search_products", arguments: '{"locale":"en"}', locale: "tr"})).toMatchObject({valid: false});
  });

  it("does not issue packaging or availability facts when the published Product lacks them", async () => {
    const product = new ProductTestBuilder().with({status: "published", packaging: undefined}).buildReconstituted();
    const result = await registry(new FakeProductRepository([product])).execute({name: "get_product_details", arguments: '{"sku":"TEST-001"}', locale: "en"});
    expect(result.facts?.map(({id}) => id)).toEqual(["product_1.identity", "product_1.capacityMl"]);
  });

  it("drops unexpected runtime specification fields from both serialization paths", async () => {
    const specifications = {capacityMl: 500, internalUnitPrice: 123456, supplierCost: 654321, privatePrice: 111111};
    const product = new ProductTestBuilder().with({status: "published", specifications}).buildReconstituted();
    const tools = registry(new FakeProductRepository([product]));
    for (const [name, args] of [["search_products", {}], ["get_product_details", {sku: product.sku.value}]] as const) {
      const result = await tools.execute({name, arguments: JSON.stringify(args), locale: "en"});
      expect(result.resultCategory).toBe("FOUND");
      expect(result.content).not.toMatch(/internalUnitPrice|supplierCost|privatePrice|123456|654321|111111/iu);
    }
  });

  it("searches exact published Product properties and exposes exact public quantities without any price field", async () => {
    const result = await registry().execute({name: "search_products", arguments: JSON.stringify({capacityMl: 500, glassColor: "olive-green", bottleShape: "round"}), locale: "en"});
    const parsed = JSON.parse(result.content);
    expect(parsed.data.products).toHaveLength(1);
    expect(parsed.data.products[0]).toMatchObject({sku: "YLP-GB-500-OG-RD", specifications: {capacityMl: 500, glassColor: "olive-green", bottleShape: "round"}, packaging: {unitsPerPackage: 36, packagesPerPallet: 63, unitsPerPallet: 2268, palletGrossWeightKg: 790, referenceLoadPallets: 26, unitsPerReferenceLoad: 58968}});
    expect(result.content).not.toMatch(/internalUnitPrice|supplierCost|purchaseCost|margin|markup|privatePrice|priceCurrency|230000/iu);
  });

  it("excludes draft and archived Products before the Agent projection", async () => {
    const published = new ProductTestBuilder().with({id: "published", sku: "PUB-1", slug: "published", status: "published"}).buildReconstituted();
    const draft = new ProductTestBuilder().with({id: "draft", sku: "DRAFT-1", slug: "draft", status: "draft"}).buildReconstituted();
    const archived = new ProductTestBuilder().with({id: "archived", sku: "ARC-1", slug: "archived", status: "archived"}).buildReconstituted();
    const tools = registry(new FakeProductRepository([published, draft, archived]));
    const all = await tools.execute({name: "search_products", arguments: "{}", locale: "en"});
    expect(JSON.parse(all.content).data.products.map(({id}: {id: string}) => id)).toEqual(["published"]);
    for (const productId of ["draft", "archived"]) {
      await expect(tools.execute({name: "get_product_details", arguments: JSON.stringify({productId}), locale: "en"})).resolves.toMatchObject({resultCategory: "NOT_FOUND", escalationReason: "PRODUCT_FACT_UNAVAILABLE"});
    }
    const unfiltered = registry({list: async () => [published, draft, archived], findBySlug: async () => null, findById: async () => null});
    const result = await unfiltered.execute({name: "search_products", arguments: "{}", locale: "en"});
    expect(JSON.parse(result.content).data.products.map(({id}: {id: string}) => id)).toEqual(["published"]);
  });

  it("strictly validates arguments and rejects unknown or disabled tools", async () => {
    const tools = registry();
    await expect(tools.execute({name: "search_products", arguments: JSON.stringify({capacityMl: "500", sql: "select *"}), locale: "en"})).resolves.toMatchObject({escalationReason: "INVALID_TOOL_CALL"});
    await expect(tools.execute({name: "hidden_pricing_tool", arguments: "{}", locale: "en"})).resolves.toMatchObject({escalationReason: "UNKNOWN_TOOL"});
    const knowledge = new StaticConversationAgentKnowledgeRepository();
    const disabled = new CodeOwnedConversationAgentToolRegistry(new ProductRepositoryConversationAgentCatalog(new StaticProductRepository()), knowledge, ["get_public_site_information"]);
    expect(disabled.definitions().map(({name}) => name)).toEqual(["get_public_site_information"]);
    await expect(disabled.execute({name: "search_products", arguments: "{}", locale: "en"})).resolves.toMatchObject({escalationReason: "UNSUPPORTED_REQUEST"});
  });

  it("reads public identity from canonical site configuration and localized approved knowledge", async () => {
    const tools = registry();
    const site = JSON.parse((await tools.execute({name: "get_public_site_information", arguments: "{}", locale: "tr"})).content).data;
    expect(site).toMatchObject({brandName: siteConfig.identity.brandName, email: siteConfig.contact.email, officeAddress: siteConfig.contact.location.officeAddress.tr});
    const pickup = JSON.parse((await tools.execute({name: "get_pickup_process", arguments: "{}", locale: "en"})).content).data;
    expect(pickup.statements.join(" ")).toContain("buyer arranges");
    expect(pickup.statements.join(" ")).toContain("not a freight or logistics provider");
  });
});
