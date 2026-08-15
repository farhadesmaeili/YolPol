import type {SubmitInquiryResult} from "@/features/inquiries/application/results/submit-inquiry-result";
import type {InquiryField, InquiryResultViewModel} from "@/features/inquiries/presentation/view-models/inquiry-view-model";

const validationFields: Readonly<Record<string, InquiryField>> = Object.freeze({"contact.fullName": "fullName", "contact.company": "company", "contact.email": "email", "contact.phone": "phone", "contact.telegramUsername": "telegramUsername", "contact.preferredMethod": "preferredContactMethod", "location.country": "country", "location.city": "city", "destination.country": "destination", "destination.city": "destination", message: "message", items: "products", "items.productId": "products", "items.sku": "products", "items.slug": "products", "items.productName": "products", "items.quantity": "quantity", "items.unit": "unit", "privacy.accepted": "privacy", "privacy.acceptedAt": "privacy", "privacy.policyVersion": "privacy"});
export function toInquiryField(field: string): InquiryField { return validationFields[field] ?? (field.startsWith("items.") && field.endsWith(".quantity") ? "quantity" : field.startsWith("items.") && field.endsWith(".unit") ? "unit" : field.startsWith("items.") ? "products" : "form"); }

export class InquiryPresenter {
  present(result: SubmitInquiryResult): InquiryResultViewModel {
    switch (result.status) {
      case "accepted": return Object.freeze({state: "accepted", inquiryId: result.inquiry.inquiryId, createdAt: result.inquiry.createdAt});
      case "accepted_with_notification_failures": return Object.freeze({state: "accepted_with_notification_warning", inquiryId: result.inquiry.inquiryId, createdAt: result.inquiry.createdAt, failedChannels: Object.freeze([...result.failedChannels])});
      case "validation_failed": return Object.freeze({state: "validation_error", field: toInquiryField(result.field)});
      case "product_not_found": case "product_unavailable": case "locale_not_available": return Object.freeze({state: "product_error"});
      case "duplicate_inquiry": case "persistence_failed": case "dependency_failed": return Object.freeze({state: "integration_unavailable"});
    }
  }
}
