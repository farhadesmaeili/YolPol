import type {ProductBottleShape, ProductCategory, ProductGlassColor} from "@/features/products/domain/types/product-types";
import type {Locale} from "@/shared/types/locale";

export const conversationAgentToolNames = [
  "search_products",
  "get_product_details",
  "get_public_site_information",
  "get_inquiry_process",
  "get_pickup_process",
  "request_staff_review",
] as const;
export type ConversationAgentToolName = (typeof conversationAgentToolNames)[number];

export const conversationAgentEscalationReasons = [
  "PRICE_QUOTATION",
  "DISCOUNT_REQUEST",
  "PAYMENT_TERMS",
  "CREDIT_REQUEST",
  "CONTRACT_COMMITMENT",
  "LEGAL_OR_REGULATORY_GUARANTEE",
  "CUSTOMS_GUARANTEE",
  "DELIVERY_COMMITMENT",
  "AVAILABILITY_UNVERIFIED",
  "PRODUCT_FACT_UNAVAILABLE",
  "CONTRADICTORY_TRUSTED_DATA",
  "UNSUPPORTED_REQUEST",
  "LOW_CONFIDENCE",
  "INVALID_TOOL_CALL",
  "UNKNOWN_TOOL",
  "LOOP_LIMIT_REACHED",
  "EXECUTION_DEADLINE_REACHED",
] as const;
export type ConversationAgentEscalationReason = (typeof conversationAgentEscalationReasons)[number];

export type ConversationAgentDecision =
  | Readonly<{type: "RESPOND"; body: string}>
  | Readonly<{type: "ESCALATE"; body: string; reason: ConversationAgentEscalationReason}>;

export type ConversationAgentProductSearch = Readonly<{
  query?: string;
  sku?: string;
  capacityMl?: number;
  glassColor?: ProductGlassColor;
  bottleShape?: ProductBottleShape;
  category?: ProductCategory;
}>;

export type PublicConversationAgentProduct = Readonly<{
  id: string;
  sku: string;
  slug: string;
  locale: Locale;
  name: string;
  shortDescription: string;
  applications: readonly string[];
  categories: readonly ProductCategory[];
  specifications: Readonly<{
    capacityMl?: number;
    glassColor?: ProductGlassColor;
    bottleShape?: ProductBottleShape;
    neckFinish?: string;
    weightGrams?: number;
    heightMm?: number;
    diameterMm?: number;
  }>;
  packaging?: Readonly<{
    unitsPerPackage: number;
    packagesPerPallet: number;
    unitsPerPallet: number;
    palletGrossWeightKg: number;
    referenceLoadPallets: number;
    unitsPerReferenceLoad: number;
  }>;
}>;

export type ConversationAgentPublicSiteInformation = Readonly<{
  brandName: string;
  publicName: string;
  email: string;
  phones: readonly string[];
  whatsapp: string;
  locationSummary: string;
  officeAddress: string;
}>;

export type ConversationAgentApprovedKnowledge = Readonly<{
  statements: readonly string[];
}>;

export type ConversationAgentToolExecution = Readonly<{
  content: string;
  facts?: readonly ConversationAgentFact[];
  resultCategory: "FOUND" | "NOT_FOUND" | "PUBLIC_INFORMATION" | "STAFF_REVIEW";
  escalationReason?: ConversationAgentEscalationReason;
}>;

export type ConversationAgentFact = Readonly<{id: string; sourceKey: string; text: string}>;

export type ConversationAgentToolValidation =
  | Readonly<{valid: true; arguments: string; signature: string}>
  | Readonly<{valid: false; reason: ConversationAgentEscalationReason}>;

export type ConversationAgentResponseCopy = Readonly<{
  social: string;
  unconfirmed: string;
  product: string; sku: string; capacityMl: string; glassColor: string; bottleShape: string;
  neckFinish: string; weightGrams: string; heightMm: string; diameterMm: string;
  unitsPerPackage: string; packagesPerPallet: string; unitsPerPallet: string; palletGrossWeightKg: string;
  referenceLoadPallets: string; unitsPerReferenceLoad: string;
  email: string; phones: string; whatsapp: string; location: string; address: string;
  colors: Readonly<Record<ProductGlassColor, string>>;
  shapes: Readonly<Record<ProductBottleShape, string>>;
}>;
