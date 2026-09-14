import type {NotificationMessage} from "@/features/inquiries/application/dto/notification-message";
import type {RenderableStaffTranslationNotificationState} from "@/features/inquiries/application/dto/customer-message-notification";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Message} from "@/features/inquiries/domain/entities/message";

export const telegramNotificationTextLimit = 3_900;
const truncationMarker = "\n… [content shortened for Telegram]\n";
const sectionTruncationMarker = "… [content shortened]";
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

function shortenSection(value: string, maximumUnits: number): string {
  if (value.length <= maximumUnits) return value;
  if (maximumUnits <= sectionTruncationMarker.length) return takeUtf16Safely(value, maximumUnits);
  return `${takeUtf16Safely(value, maximumUnits - sectionTruncationMarker.length).trimEnd()}${sectionTruncationMarker}`;
}

function boundedCustomerMessageText(
  header: string,
  context: string,
  originalBody: string,
  staffTranslation: RenderableStaffTranslationNotificationState,
  footer: string,
): string {
  const translationLabel = staffTranslation.status === "SUCCEEDED"
    ? "Staff translation:"
    : staffTranslation.reason === "NOT_REQUIRED" ? null : "Staff translation: unavailable; original message shown.";
  const translationBody = staffTranslation.status === "SUCCEEDED" ? clean(staffTranslation.body) : null;
  const build = (original: string, translated: string | null) => [
    header,
    context,
    `Message:\n  ${original}`,
    translated === null ? translationLabel : `${translationLabel}\n  ${translated}`,
    footer,
  ].filter(Boolean).join("\n");
  const original = clean(originalBody);
  const full = build(original, translationBody);
  if (full.length <= telegramNotificationTextLimit) return full;

  const empty = build("", translationBody === null ? null : "");
  const contentBudget = Math.max(2, telegramNotificationTextLimit - empty.length);
  const originalBudget = translationBody === null ? contentBudget : Math.floor(contentBudget / 2);
  const translationBudget = translationBody === null ? 0 : contentBudget - originalBudget;
  return build(
    shortenSection(original, originalBudget),
    translationBody === null ? null : shortenSection(translationBody, translationBudget),
  );
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
  staffTranslation: RenderableStaffTranslationNotificationState,
  staffInquiryUrl: string,
): NotificationMessage {
  const contact = inquiry.contact;
  const header = [
    "NEW CUSTOMER MESSAGE",
    `Inquiry reference: ${inquiry.id.value}`,
    `Conversation reference: ${clean(conversationId)}`,
    `Customer: ${clean(contact.fullName)}`,
  ].join("\n");
  const context = [
    contact.company ? `Company: ${clean(contact.company)}` : undefined,
    `Email: ${clean(contact.email)}`,
    `Phone: ${clean(contact.phone)}`,
  ].filter((line): line is string => line !== undefined).join("\n");
  const footer = `Staff panel: ${staffInquiryUrl}`;
  return Object.freeze({text: boundedCustomerMessageText(header, context, message.body, staffTranslation, footer)});
}
