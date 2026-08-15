import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import {InquiryMappingError} from "@/features/inquiries/infrastructure/errors/inquiry-mapping-error";
import type {InquiryRecord} from "@/features/inquiries/infrastructure/records/inquiry-record";

export function toInquiryRecord(inquiry: Inquiry): InquiryRecord {
  const contact = inquiry.contact; const location = inquiry.location; const destination = inquiry.destination; const privacy = inquiry.privacy;
  return Object.freeze({id: inquiry.id.value, status: inquiry.status, fullName: contact.fullName, company: contact.company ?? null, email: contact.email, phone: contact.phone, telegramUsername: contact.telegramUsername ?? null, preferredContactMethod: contact.preferredMethod, country: location.country, city: location.city ?? null, destinationCountry: destination?.country ?? null, destinationCity: destination?.city ?? null, message: inquiry.message ?? null, sourceLocale: inquiry.source.locale, sourcePath: inquiry.source.path, privacyAccepted: privacy.accepted, privacyAcceptedAt: privacy.acceptedAt.toISOString(), privacyPolicyVersion: privacy.policyVersion, createdAt: inquiry.createdAt.toISOString(), updatedAt: inquiry.updatedAt.toISOString(), items: Object.freeze(inquiry.items.map((entry) => Object.freeze({...entry})))});
}
export function toInquiry(record: InquiryRecord): Inquiry {
  try { return Inquiry.reconstitute({id: record.id, status: record.status, contact: {fullName: record.fullName, company: record.company ?? undefined, email: record.email, phone: record.phone, telegramUsername: record.telegramUsername ?? undefined, preferredMethod: record.preferredContactMethod}, location: {country: record.country, city: record.city ?? undefined}, destination: record.destinationCountry || record.destinationCity ? {country: record.destinationCountry ?? undefined, city: record.destinationCity ?? undefined} : undefined, message: record.message ?? undefined, privacy: {accepted: record.privacyAccepted, acceptedAt: new Date(record.privacyAcceptedAt), policyVersion: record.privacyPolicyVersion}, source: {locale: record.sourceLocale, path: record.sourcePath}, items: record.items.map((entry) => ({...entry})), createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt)}); }
  catch (error) { throw new InquiryMappingError("Persisted Inquiry record is invalid.", error); }
}
