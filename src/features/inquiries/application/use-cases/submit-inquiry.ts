import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {toAcceptedInquiryDto} from "@/features/inquiries/application/mappers/inquiry-dto-mapper";
import {DuplicateInquiryIdError, type Clock, type InquiryIdGenerator, type InquiryNotificationDispatcher, type InquiryProductCatalog, type InquiryRepository, type NotificationChannel} from "@/features/inquiries/application/ports/inquiry-ports";
import type {SubmitInquiryResult} from "@/features/inquiries/application/results/submit-inquiry-result";
import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {createInquiryProductSnapshot} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";

function isRecord(value: unknown): value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function validCatalogProduct(value: unknown, requestedId: string): value is Awaited<ReturnType<InquiryProductCatalog["findById"]>> & object {
  if (!isRecord(value) || value.id !== requestedId || typeof value.id !== "string" || typeof value.sku !== "string" || !value.sku.trim() || typeof value.slug !== "string" || !value.slug.trim()) return false;
  if (!(["draft", "published", "archived"] as const).includes(value.status as never)) return false;
  return isRecord(value.localizedNames);
}

export class SubmitInquiry {
  constructor(private readonly repository: InquiryRepository, private readonly catalog: InquiryProductCatalog, private readonly idGenerator: InquiryIdGenerator, private readonly clock: Clock, private readonly notifications: InquiryNotificationDispatcher) {}
  async execute(input: SubmitInquiryInput): Promise<SubmitInquiryResult> {
    if (!Array.isArray(input.items) || input.items.length === 0) return {status: "validation_failed", field: "items"};
    const productIds = input.items.map(({productId}) => productId);
    if (new Set(productIds).size !== productIds.length) return {status: "validation_failed", field: "items.productId"};
    const trustedItems = [];
    for (const requested of input.items) {
      let product: Awaited<ReturnType<InquiryProductCatalog["findById"]>>;
      try { product = await this.catalog.findById(requested.productId); }
      catch { return {status: "dependency_failed", dependency: "catalog"}; }
      if (!product) return {status: "product_not_found", productId: requested.productId};
      if (!validCatalogProduct(product, requested.productId)) return {status: "dependency_failed", dependency: "catalog"};
      if (product.status !== "published") return {status: "product_unavailable", productId: requested.productId};
      const productName = product.localizedNames[input.source.locale];
      if (productName === undefined) return {status: "locale_not_available", productId: requested.productId};
      try { trustedItems.push({...createInquiryProductSnapshot({productId: product.id, sku: product.sku, slug: product.slug, productName}), quantity: requested.quantity, unit: requested.unit}); }
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
    try { await this.repository.save(inquiry); }
    catch (error) { return error instanceof DuplicateInquiryIdError ? {status: "duplicate_inquiry"} : {status: "persistence_failed"}; }
    const failedChannels: NotificationChannel[] = [];
    for (const channel of ["email", "telegram"] as const) {
      try { const result: unknown = await this.notifications.dispatch(inquiry, channel); if (!isRecord(result) || result.status !== "requested") failedChannels.push(channel); }
      catch { failedChannels.push(channel); }
    }
    const dto = toAcceptedInquiryDto(inquiry);
    return failedChannels.length ? {status: "accepted_with_notification_failures", inquiry: dto, failedChannels: Object.freeze(failedChannels)} : {status: "accepted", inquiry: dto};
  }
}
