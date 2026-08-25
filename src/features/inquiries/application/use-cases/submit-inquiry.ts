import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {toAcceptedInquiryDto} from "@/features/inquiries/application/mappers/inquiry-dto-mapper";
import {DuplicateInquiryIdError, type Clock, type InquiryIdGenerator, type InquiryProductCatalog, type InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import type {SubmitInquiryResult} from "@/features/inquiries/application/results/submit-inquiry-result";
import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import {Conversation} from "@/features/inquiries/domain/entities/conversation";
import {createInquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {createInquiryProductSnapshot} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";
import type {CreateConversationAccess} from "@/features/inquiries/application/use-cases/create-conversation-access";
import {normalizeInquiryProductId} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";
import {normalizeInquiryQuantity} from "@/features/inquiries/domain/validation/inquiry-input-validation";

function isRecord(value: unknown): value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function validCatalogProduct(value: unknown, requestedId: string): value is NonNullable<Awaited<ReturnType<InquiryProductCatalog["findById"]>>> & {packaging: {unitsPerPallet: number; grossPalletWeightGrams: number}} {
  if (!isRecord(value) || value.id !== requestedId || typeof value.id !== "string" || typeof value.sku !== "string" || !value.sku.trim() || typeof value.slug !== "string" || !value.slug.trim()) return false;
  if (!(["draft", "published", "archived"] as const).includes(value.status as never)) return false;
  if (!isRecord(value.localizedNames) || !isRecord(value.packaging)) return false;
  return Number.isSafeInteger(value.packaging.unitsPerPallet) && (value.packaging.unitsPerPallet as number) > 0 && Number.isSafeInteger(value.packaging.grossPalletWeightGrams) && (value.packaging.grossPalletWeightGrams as number) > 0;
}

export class SubmitInquiry {
  constructor(private readonly repository: InquiryRepository, private readonly catalog: InquiryProductCatalog, private readonly idGenerator: InquiryIdGenerator, private readonly clock: Clock, private readonly createAccess: CreateConversationAccess) {}
  async execute(input: SubmitInquiryInput): Promise<SubmitInquiryResult> {
    if (!Array.isArray(input.items) || input.items.length === 0) return {status: "validation_failed", field: "items"};
    const productIds = input.items.map(({productId}) => productId);
    if (new Set(productIds).size !== productIds.length) return {status: "validation_failed", field: "items.productId"};
    const trustedItems = [];
    for (const [index, requested] of input.items.entries()) {
      try { normalizeInquiryProductId(requested.productId); } catch { return {status:"validation_failed",field:`items.${index}.productId`}; }
      try { normalizeInquiryQuantity(requested.palletCount); } catch { return {status:"validation_failed",field:`items.${index}.palletCount`}; }
      let product: Awaited<ReturnType<InquiryProductCatalog["findById"]>>;
      try { product = await this.catalog.findById(requested.productId); }
      catch { return {status: "dependency_failed", dependency: "catalog"}; }
      if (!product) return {status: "product_not_found", productId: requested.productId};
      if (!validCatalogProduct(product, requested.productId)) return {status: "dependency_failed", dependency: "catalog"};
      if (product.status !== "published") return {status: "product_unavailable", productId: requested.productId};
      const productName = product.localizedNames[input.source.locale];
      if (productName === undefined) return {status: "locale_not_available", productId: requested.productId};
      const unitsRequested = requested.palletCount * product.packaging.unitsPerPallet;
      const grossWeightGrams = requested.palletCount * product.packaging.grossPalletWeightGrams;
      if (!Number.isSafeInteger(unitsRequested) || !Number.isSafeInteger(grossWeightGrams)) return {status: "validation_failed", field: `items.${index}.palletCount`};
      try { trustedItems.push({...createInquiryProductSnapshot({productId: product.id, sku: product.sku, slug: product.slug, productName}), quantity: requested.palletCount, unit: "pallets" as const}); }
      catch (error) { if (error instanceof InquiryValidationError) return {status: "dependency_failed", dependency: "catalog"}; throw error; }
    }
    let inquiry: Inquiry;
    let now: Date;
    try { const clockValue: unknown = this.clock.now(); if (!(clockValue instanceof Date) || !Number.isFinite(clockValue.getTime())) return {status: "dependency_failed", dependency: "clock"}; now = new Date(clockValue.getTime()); }
    catch { return {status: "dependency_failed", dependency: "clock"}; }
    let id: InquiryId;
    try { id = InquiryId.create(this.idGenerator.generate()); }
    catch (error) { if (error instanceof InquiryValidationError) return {status: "dependency_failed", dependency: "id_generator"}; return {status: "dependency_failed", dependency: "id_generator"}; }
    try {
      inquiry = Inquiry.create({...input, id: id.value, items: trustedItems, privacy: {...input.privacy, acceptedAt: now}, createdAt: now});
    } catch (error) {
      if (error instanceof InquiryValidationError) return {status: "validation_failed", field: error.field};
      throw error;
    }
    const conversation = Conversation.start({id: inquiry.id.value, inquiryId: inquiry.id.value, channel: "WEBSITE", createdAt: inquiry.createdAt});
    if (inquiry.message) conversation.addMessage({id: `${inquiry.id.value}-initial`, senderType: "CUSTOMER", channel: "WEBSITE", body: inquiry.message, createdAt: inquiry.createdAt});
    const access = this.createAccess.execute({conversationId: conversation.id.value, createdAt: inquiry.createdAt});
    if (access.status === "dependency_failed") return {status: "dependency_failed", dependency: "access_token"};
    try { await this.repository.save(inquiry, createInquiryCreated(inquiry.id.value, inquiry.createdAt), conversation, access.credential); }
    catch (error) { return error instanceof DuplicateInquiryIdError ? {status: "duplicate_inquiry"} : {status: "persistence_failed"}; }
    return {status: "accepted", inquiry: toAcceptedInquiryDto(inquiry), conversationAccessToken: access.token};
  }
}
