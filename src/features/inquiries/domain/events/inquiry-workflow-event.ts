import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import {InquiryAssignmentError, InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";

export const inquiryWorkflowEventTypes = ["INQUIRY_CREATED", "STATUS_CHANGED", "ASSIGNED", "UNASSIGNED"] as const;
export type InquiryWorkflowEventType = (typeof inquiryWorkflowEventTypes)[number];

export type InquiryWorkflowEvent = Readonly<{
  inquiryId: string;
  type: InquiryWorkflowEventType;
  previousValue: string | null;
  newValue: string | null;
  actorReference: string | null;
  occurredAt: string;
}>;

export type StoredInquiryWorkflowEvent = InquiryWorkflowEvent & Readonly<{id: string}>;

function timestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new InquiryValidationError("occurredAt", "Workflow event timestamp must be a valid date.");
  return value.toISOString();
}

export function normalizeActorReference(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > 160 || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new InquiryAssignmentError("Invalid workflow actor reference.");
  }
  return value;
}

function event(input: Omit<InquiryWorkflowEvent, "inquiryId" | "actorReference" | "occurredAt"> & Readonly<{inquiryId: string; actorReference?: string | null; occurredAt: Date}>): InquiryWorkflowEvent {
  return Object.freeze({
    inquiryId: InquiryId.create(input.inquiryId).value,
    type: input.type,
    previousValue: input.previousValue,
    newValue: input.newValue,
    actorReference: normalizeActorReference(input.actorReference),
    occurredAt: timestamp(input.occurredAt),
  });
}

export function createInquiryCreatedWorkflowEvent(inquiryId: string, status: InquiryStatus, occurredAt: Date): InquiryWorkflowEvent {
  return event({inquiryId, type: "INQUIRY_CREATED", previousValue: null, newValue: status, occurredAt});
}

export function createStatusChangedWorkflowEvent(inquiryId: string, previousStatus: InquiryStatus, newStatus: InquiryStatus, actorReference: string | null | undefined, occurredAt: Date): InquiryWorkflowEvent {
  return event({inquiryId, type: "STATUS_CHANGED", previousValue: previousStatus, newValue: newStatus, actorReference, occurredAt});
}

export function createAssignmentWorkflowEvent(inquiryId: string, previousTeamMemberId: string | null, newTeamMemberId: string | null, actorReference: string | null | undefined, occurredAt: Date): InquiryWorkflowEvent {
  if (previousTeamMemberId === null && newTeamMemberId === null) throw new InquiryAssignmentError("An assignment event requires a change.");
  if (previousTeamMemberId !== null) TeamMember.reconstitute(previousTeamMemberId, true);
  if (newTeamMemberId !== null) TeamMember.reconstitute(newTeamMemberId, true);
  return event({inquiryId, type: newTeamMemberId === null ? "UNASSIGNED" : "ASSIGNED", previousValue: previousTeamMemberId, newValue: newTeamMemberId, actorReference, occurredAt});
}
