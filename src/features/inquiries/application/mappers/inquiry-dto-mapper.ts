import type {AcceptedInquiryDto} from "@/features/inquiries/application/dto/inquiry-dto";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";

export function toAcceptedInquiryDto(inquiry: Inquiry): AcceptedInquiryDto { return Object.freeze({inquiryId: inquiry.id.value, status: "received", createdAt: inquiry.createdAt.toISOString()}); }
