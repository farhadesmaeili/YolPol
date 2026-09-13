import {describe, expect, it} from "vitest";
import {productFacts, renderConversationAgentAnswer} from "@/features/conversation-ai-agent/application/services/conversation-agent-facts";
import {ProductRepositoryConversationAgentCatalog} from "@/features/conversation-ai-agent/infrastructure/repositories/product-repository-conversation-agent-catalog";
import {StaticProductRepository} from "@/features/products/infrastructure/repositories/static-product-repository";
import {conversationAgentResponseCopy} from "@/features/conversation-ai-agent/infrastructure/config/conversation-agent-response-copy";

describe("grounded product grouping", () => {
  it("deduplicates a canonical fact selected through two observations without merging different products", async () => {
    const catalog = new ProductRepositoryConversationAgentCatalog(new StaticProductRepository());
    const product = await catalog.getDetails({sku: "YLP-GB-500-OG-RD", locale: "en"});
    expect(product).not.toBeNull();
    const first = productFacts(product!, conversationAgentResponseCopy.en, 1);
    const second = productFacts(product!, conversationAgentResponseCopy.en, 7);
    const content = JSON.stringify({type: "GROUNDED", facts: [
      {observationId: "o1", factId: "product_1.unitsPerPallet"},
      {observationId: "o2", factId: "product_7.unitsPerPallet"},
    ]});
    expect(renderConversationAgentAnswer(content, new Map([["o1", first], ["o2", second]])))
      .toBe(`${first[0]!.text}\n\nUnits per pallet: 2268`);
  });

  it.each(["en", "tr", "fa", "ar"] as const)("keeps interleaved %s facts under their own canonical product", async (locale) => {
    const catalog = new ProductRepositoryConversationAgentCatalog(new StaticProductRepository());
    const products = await catalog.search({capacityMl: 500, locale});
    expect(products.length).toBeGreaterThan(2);
    const left = productFacts(products[0]!, conversationAgentResponseCopy[locale], 1);
    const right = productFacts(products[2]!, conversationAgentResponseCopy[locale], 2);
    const factIds = [left[1]!.id, right[1]!.id, left[2]!.id, right[0]!.id, left[0]!.id];
    const body = renderConversationAgentAnswer(JSON.stringify({type: "GROUNDED", facts: factIds.map((factId) => ({observationId: "o1", factId}))}),
      new Map([["o1", [...left, ...right]]]));
    expect(body).toBe([left[0]!.text, left[1]!.text, left[2]!.text, right[0]!.text, right[1]!.text].join("\n\n"));
  });
});
