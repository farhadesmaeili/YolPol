import type {AiProviderToolDefinition} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import type {ConversationAgentKnowledgeRepository, ConversationAgentProductCatalog, ConversationAgentToolRegistry} from "@/features/conversation-ai-agent/application/ports/conversation-agent-ports";
import {
  conversationAgentEscalationReasons,
  conversationAgentToolNames,
  type ConversationAgentEscalationReason,
  type ConversationAgentProductSearch,
  type ConversationAgentToolExecution,
  type ConversationAgentToolName,
} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import {productBottleShapes, productCategories, productGlassColors} from "@/features/products/domain/types/product-types";
import {isSupportedLocale, type Locale} from "@/shared/types/locale";
import type {ConversationAgentFact, ConversationAgentToolValidation} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import {productFacts} from "@/features/conversation-ai-agent/application/services/conversation-agent-facts";

const emptyObjectSchema = Object.freeze({type: "object", properties: Object.freeze({}), required: Object.freeze([]), additionalProperties: false});
const toolDefinitions: Readonly<Record<ConversationAgentToolName, AiProviderToolDefinition>> = Object.freeze({
  search_products: Object.freeze({
    name: "search_products", description: "Search published YOLPOL products using public catalog fields. Use this before making product claims.",
    inputSchema: Object.freeze({type: "object", properties: Object.freeze({
      query: {type: "string", minLength: 1, maxLength: 120}, sku: {type: "string", minLength: 1, maxLength: 64},
      capacityMl: {type: "integer", minimum: 1, maximum: 10_000}, glassColor: {type: "string", enum: productGlassColors},
      bottleShape: {type: "string", enum: productBottleShapes}, category: {type: "string", enum: productCategories},
    }), required: Object.freeze([]), additionalProperties: false}),
  }),
  get_product_details: Object.freeze({
    name: "get_product_details", description: "Get one published YOLPOL product by exactly one public product ID, SKU, or slug. Includes authoritative packaging when available.",
    inputSchema: Object.freeze({type: "object", properties: Object.freeze({
      productId: {type: "string", minLength: 1, maxLength: 128}, sku: {type: "string", minLength: 1, maxLength: 64}, slug: {type: "string", minLength: 1, maxLength: 128},
    }), required: Object.freeze([]), oneOf: [{required: ["productId"]}, {required: ["sku"]}, {required: ["slug"]}], additionalProperties: false}),
  }),
  get_public_site_information: Object.freeze({name: "get_public_site_information", description: "Get canonical public YOLPOL identity, contact, and location information.", inputSchema: emptyObjectSchema}),
  get_inquiry_process: Object.freeze({name: "get_inquiry_process", description: "Get approved public information about the inquiry-only wholesale purchasing process.", inputSchema: emptyObjectSchema}),
  get_pickup_process: Object.freeze({name: "get_pickup_process", description: "Get approved public information about buyer-arranged transport and pickup.", inputSchema: emptyObjectSchema}),
  request_staff_review: Object.freeze({
    name: "request_staff_review", description: "Request Staff review when trusted tools cannot support the request. This records no customer content and performs no business action.",
    inputSchema: Object.freeze({type: "object", properties: Object.freeze({reason: {type: "string", enum: conversationAgentEscalationReasons}}), required: Object.freeze(["reason"]), additionalProperties: false}),
  }),
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasExactKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function boundedText(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum) throw new TypeError("Invalid Agent tool argument.");
  return value.trim();
}
function parseObject(value: string): Readonly<Record<string, unknown>> {
  if (value.length < 1 || value.length > 8_000) throw new TypeError("Invalid Agent tool arguments.");
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new TypeError("Invalid Agent tool arguments.");
  return parsed;
}
function noArguments(value: Readonly<Record<string, unknown>>): void {
  if (Object.keys(value).length !== 0) throw new TypeError("This Agent tool accepts no arguments.");
}
function parseSearch(value: Readonly<Record<string, unknown>>): ConversationAgentProductSearch {
  const keys = ["query", "sku", "capacityMl", "glassColor", "bottleShape", "category"] as const;
  if (!hasExactKeys(value, keys)) throw new TypeError("Unknown Product search argument.");
  const capacityMl = value.capacityMl;
  if (capacityMl !== undefined && (!Number.isSafeInteger(capacityMl) || (capacityMl as number) < 1 || (capacityMl as number) > 10_000)) throw new TypeError("Invalid Product capacity.");
  if (value.glassColor !== undefined && !(productGlassColors as readonly unknown[]).includes(value.glassColor)) throw new TypeError("Invalid glass color.");
  if (value.bottleShape !== undefined && !(productBottleShapes as readonly unknown[]).includes(value.bottleShape)) throw new TypeError("Invalid bottle shape.");
  if (value.category !== undefined && !(productCategories as readonly unknown[]).includes(value.category)) throw new TypeError("Invalid Product category.");
  return Object.freeze({
    ...(value.query === undefined ? {} : {query: boundedText(value.query, 120)?.normalize("NFKC").toLowerCase()}),
    ...(value.sku === undefined ? {} : {sku: boundedText(value.sku, 64)?.normalize("NFKC").toLowerCase()}),
    ...(capacityMl === undefined ? {} : {capacityMl: capacityMl as number}),
    ...(value.glassColor === undefined ? {} : {glassColor: value.glassColor as ConversationAgentProductSearch["glassColor"]}),
    ...(value.bottleShape === undefined ? {} : {bottleShape: value.bottleShape as ConversationAgentProductSearch["bottleShape"]}),
    ...(value.category === undefined ? {} : {category: value.category as ConversationAgentProductSearch["category"]}),
  });
}
function parseDetails(value: Readonly<Record<string, unknown>>) {
  const keys = ["productId", "sku", "slug"] as const;
  if (!hasExactKeys(value, keys)) throw new TypeError("Unknown Product-detail argument.");
  const result = {
    ...(value.productId === undefined ? {} : {productId: boundedText(value.productId, 128)}),
    ...(value.sku === undefined ? {} : {sku: boundedText(value.sku, 64)?.normalize("NFKC").toLowerCase()}),
    ...(value.slug === undefined ? {} : {slug: boundedText(value.slug, 128)}),
  };
  if (Object.values(result).length !== 1) throw new TypeError("Exactly one Product identifier is required.");
  return Object.freeze(result);
}
function execution(content: unknown, resultCategory: ConversationAgentToolExecution["resultCategory"], escalationReason?: ConversationAgentEscalationReason, facts?: readonly ConversationAgentFact[]): ConversationAgentToolExecution {
  return Object.freeze({content: JSON.stringify(Object.freeze({source: "trusted_server_tool", data: content})), resultCategory, ...(escalationReason ? {escalationReason} : {}), ...(facts ? {facts} : {})});
}

export class CodeOwnedConversationAgentToolRegistry implements ConversationAgentToolRegistry {
  private readonly enabled: ReadonlySet<ConversationAgentToolName>;

  constructor(
    private readonly products: ConversationAgentProductCatalog,
    private readonly knowledge: ConversationAgentKnowledgeRepository,
    enabled: readonly ConversationAgentToolName[] = conversationAgentToolNames,
  ) {
    if (new Set(enabled).size !== enabled.length || enabled.some((name) => !conversationAgentToolNames.includes(name))) throw new TypeError("Invalid Agent tool configuration.");
    this.enabled = new Set(enabled);
  }

  definitions(): readonly AiProviderToolDefinition[] { return Object.freeze(conversationAgentToolNames.filter((name) => this.enabled.has(name)).map((name) => toolDefinitions[name])); }
  isEnabled(name: ConversationAgentToolName): boolean { return this.enabled.has(name); }

  validate(input: Readonly<{name: string; arguments: string; locale: Locale}>): ConversationAgentToolValidation {
    if (!isSupportedLocale(input.locale)) return {valid: false, reason: "INVALID_TOOL_CALL"};
    if (!(conversationAgentToolNames as readonly string[]).includes(input.name)) return {valid: false, reason: "UNKNOWN_TOOL"};
    const name = input.name as ConversationAgentToolName;
    if (!this.enabled.has(name)) return {valid: false, reason: "UNSUPPORTED_REQUEST"};
    try {
      const args = parseObject(input.arguments);
      let validated: Readonly<Record<string, unknown>>;
      if (name === "search_products") validated = parseSearch(args);
      else if (name === "get_product_details") validated = parseDetails(args);
      else if (name === "request_staff_review") {
        if (!hasExactKeys(args, ["reason"]) || typeof args.reason !== "string" || !(conversationAgentEscalationReasons as readonly string[]).includes(args.reason)) throw new TypeError("Invalid Staff review reason.");
        validated = {reason: args.reason};
      } else { noArguments(args); validated = {}; }
      // All current schemas are flat scalar objects; nested objects and arrays have been rejected.
      const canonical = JSON.stringify(Object.fromEntries(Object.entries(validated).sort(([left], [right]) => left.localeCompare(right))));
      return {valid: true, arguments: canonical, signature: `${name}:${input.locale}:${canonical}`};
    } catch { return {valid: false, reason: "INVALID_TOOL_CALL"}; }
  }

  async execute(input: Readonly<{name: string; arguments: string; locale: Locale; signal?: AbortSignal}>): Promise<ConversationAgentToolExecution> {
    if (input.signal?.aborted) return execution({status: "rejected"}, "STAFF_REVIEW", "EXECUTION_DEADLINE_REACHED");
    const validated = this.validate(input);
    if (!validated.valid) return execution({status: "rejected"}, "STAFF_REVIEW", validated.reason);
    const name = input.name as ConversationAgentToolName;
    const args = parseObject(validated.arguments);
    try {
      if (name === "search_products") {
        const products = await this.products.search({...parseSearch(args), locale: input.locale});
        const copy = await this.knowledge.getResponseCopy(input.locale);
        return products.length === 0 ? execution({status: "not_found"}, "NOT_FOUND", "PRODUCT_FACT_UNAVAILABLE") : execution({products}, "FOUND", undefined, products.flatMap((product, index) => productFacts(product, copy, index + 1)));
      }
      if (name === "get_product_details") {
        const product = await this.products.getDetails({...parseDetails(args), locale: input.locale});
        const copy = await this.knowledge.getResponseCopy(input.locale);
        return product ? execution({product}, "FOUND", undefined, productFacts(product, copy, 1)) : execution({status: "not_found"}, "NOT_FOUND", "PRODUCT_FACT_UNAVAILABLE");
      }
      if (name === "get_public_site_information") {
        const site = await this.knowledge.getPublicSiteInformation(input.locale);
        const copy = await this.knowledge.getResponseCopy(input.locale);
        return execution(site, "PUBLIC_INFORMATION", undefined, [
          {id: "identity", sourceKey: "site:identity", text: site.publicName}, {id: "email", sourceKey: "site:email", text: `${copy.email}: ${site.email}`},
          {id: "phones", sourceKey: "site:phones", text: `${copy.phones}: ${site.phones.join(", ")}`}, {id: "whatsapp", sourceKey: "site:whatsapp", text: `${copy.whatsapp}: ${site.whatsapp}`},
          {id: "location", sourceKey: "site:location", text: `${copy.location}: ${site.locationSummary}`}, {id: "address", sourceKey: "site:address", text: `${copy.address}: ${site.officeAddress}`},
        ]);
      }
      if (name === "get_inquiry_process" || name === "get_pickup_process") {
        const policy = name === "get_inquiry_process" ? await this.knowledge.getInquiryProcess(input.locale) : await this.knowledge.getPickupProcess(input.locale);
        if (!policy.statements.length || policy.statements.some((text) => !text.trim())) return execution({status: "not_found"}, "NOT_FOUND", "PRODUCT_FACT_UNAVAILABLE");
        return execution(policy, "PUBLIC_INFORMATION", undefined, [{id: "policy", sourceKey: `knowledge:${name}`, text: policy.statements.join(" ")}]);
      }
      if (!hasExactKeys(args, ["reason"]) || typeof args.reason !== "string" || !(conversationAgentEscalationReasons as readonly string[]).includes(args.reason)) throw new TypeError("Invalid Staff review reason.");
      return execution({status: "staff_review_required"}, "STAFF_REVIEW", args.reason as ConversationAgentEscalationReason);
    } catch {
      return execution({status: "unavailable"}, "STAFF_REVIEW", "PRODUCT_FACT_UNAVAILABLE");
    }
  }
}
