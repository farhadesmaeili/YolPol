import type {NotificationMessage} from "@/features/inquiries/application/dto/notification-message";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";

const unitLabels = Object.freeze({pieces: "pieces", packages: "packages", pallets: "pallets", truckloads: "truckloads"});

export function formatInquiryCreatedNotification(inquiry: Inquiry): NotificationMessage {
  const contact = inquiry.contact;
  const customerLines = [
    `Customer: ${contact.fullName}`,
    contact.company ? `Company: ${contact.company}` : undefined,
    `Email: ${contact.email}`,
    `Phone: ${contact.phone}`,
  ].filter((line): line is string => line !== undefined);
  const products = inquiry.items.map((item) => `- ${item.productName} (${item.sku}): ${item.quantity} ${unitLabels[item.unit]}`);

  return Object.freeze({
    subject: `New inquiry ${inquiry.id.value}`,
    body: [`Inquiry: ${inquiry.id.value}`, ...customerLines, "Requested products:", ...products].join("\n"),
  });
}
