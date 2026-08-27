import type {NotificationMessage} from "@/features/inquiries/application/dto/notification-message";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Message} from "@/features/inquiries/domain/entities/message";

export const telegramNotificationTextLimit = 3_900;
const truncationMarker = "\n… [content shortened for Telegram]\n";
const unitLabels = Object.freeze({pieces: "pieces", packages: "packages", pallets: "pallets", truckloads: "truckloads"});
const unsafeControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;

function clean(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").replace(unsafeControls, " ")
    .split("\n").map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join("\n  ").trim();
}

function takeUtf16Safely(value: string, maximumUnits: number): string {
  if (maximumUnits <= 0) return "";
  let result = "";
  let units = 0;
  for (const character of value) {
    if (units + character.length > maximumUnits) break;
    result += character;
    units += character.length;
  }
  return result;
}

function boundedText(header: string, middle: string, footer: string): string {
  const full = [header, middle, footer].filter(Boolean).join("\n");
  if (full.length <= telegramNotificationTextLimit) return full;
  const fixed = `${header}${truncationMarker}\n${footer}`;
  const available = telegramNotificationTextLimit - fixed.length;
  if (available > 0) return `${header}${truncationMarker}${takeUtf16Safely(middle, available).trimEnd()}\n${footer}`;
  const footerBudget = Math.min(footer.length, Math.floor(telegramNotificationTextLimit / 3));
  const safeFooter = takeUtf16Safely(footer, footerBudget);
  const safeHeader = takeUtf16Safely(header, telegramNotificationTextLimit - safeFooter.length - truncationMarker.length);
  return `${safeHeader}${truncationMarker}${safeFooter}`;
}

export function formatInquiryCreatedNotification(inquiry: Inquiry, staffInquiryUrl: string): NotificationMessage {
  const contact = inquiry.contact;
  const location = inquiry.location;
  const destination = inquiry.destination;
  const header = ["New YOLPOL inquiry", `Inquiry reference: ${inquiry.id.value}`, `Customer: ${clean(contact.fullName)}`].join("\n");
  const middle = [
    contact.company ? `Company: ${clean(contact.company)}` : undefined,
    `Location: ${clean([location.country, location.city].filter(Boolean).join(", "))}`,
    destination?.country || destination?.city ? `Destination: ${clean([destination.country, destination.city].filter(Boolean).join(", "))}` : undefined,
    `Preferred contact methods: ${contact.preferredMethods.join(", ")}`,
    `Email: ${clean(contact.email)}`,
    `Phone: ${clean(contact.phone)}`,
    contact.whatsappPhone ? `WhatsApp: ${clean(contact.whatsappPhone)}` : undefined,
    contact.telegramUsername ? `Customer Telegram: ${clean(contact.telegramUsername)}` : undefined,
    "Requested items:",
    ...inquiry.items.map((item) => `  - ${clean(item.productName)} (${clean(item.sku)}): ${item.quantity} ${unitLabels[item.unit]}`),
    inquiry.message ? `Customer message:\n  ${clean(inquiry.message)}` : undefined,
  ].filter((line): line is string => line !== undefined).join("\n");
  const footer = [`Source locale: ${inquiry.source.locale}`, `Staff panel: ${staffInquiryUrl}`].join("\n");
  return Object.freeze({text: boundedText(header, middle, footer)});
}

export function formatCustomerConversationMessageCreatedNotification(
  inquiry: Inquiry,
  conversationId: string,
  message: Message,
  staffInquiryUrl: string,
): NotificationMessage {
  const contact = inquiry.contact;
  const header = [
    "NEW CUSTOMER MESSAGE",
    `Inquiry reference: ${inquiry.id.value}`,
    `Conversation reference: ${clean(conversationId)}`,
    `Customer: ${clean(contact.fullName)}`,
  ].join("\n");
  const middle = [
    contact.company ? `Company: ${clean(contact.company)}` : undefined,
    `Email: ${clean(contact.email)}`,
    `Phone: ${clean(contact.phone)}`,
    `Message:\n  ${clean(message.body)}`,
  ].filter((line): line is string => line !== undefined).join("\n");
  const footer = `Staff panel: ${staffInquiryUrl}`;
  return Object.freeze({text: boundedText(header, middle, footer)});
}
