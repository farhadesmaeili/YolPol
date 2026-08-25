import {describe, expect, it} from "vitest";

import {InquiryAssignment} from "@/features/inquiries/domain/entities/inquiry-assignment";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";
import {InquiryAssignmentError, InquiryTransitionError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {createAssignmentWorkflowEvent, createStatusChangedWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

const allowedTransitions: readonly Readonly<[InquiryStatus, InquiryStatus]>[] = [
  ["NEW", "WAITING_FOR_TEAM"], ["NEW", "CLOSED"],
  ["WAITING_FOR_TEAM", "WAITING_FOR_CUSTOMER"], ["WAITING_FOR_TEAM", "QUOTED"], ["WAITING_FOR_TEAM", "CLOSED"],
  ["WAITING_FOR_CUSTOMER", "WAITING_FOR_TEAM"], ["WAITING_FOR_CUSTOMER", "QUOTED"], ["WAITING_FOR_CUSTOMER", "CLOSED"],
  ["QUOTED", "WAITING_FOR_TEAM"], ["QUOTED", "WAITING_FOR_CUSTOMER"], ["QUOTED", "CONFIRMED"], ["QUOTED", "CLOSED"],
  ["CONFIRMED", "CLOSED"],
];

describe("Inquiry workflow domain", () => {
  it.each(allowedTransitions)("allows %s to transition to %s", (from, to) => {
    const inquiry = new InquiryTestBuilder().buildReconstituted({status: from});
    inquiry.transitionTo(to, new Date("2026-01-02T00:00:00.000Z"));
    expect(inquiry.status).toBe(to);
  });

  it.each([
    ["WAITING_FOR_TEAM", "NEW"], ["WAITING_FOR_CUSTOMER", "NEW"], ["QUOTED", "NEW"],
    ["CONFIRMED", "QUOTED"], ["CLOSED", "WAITING_FOR_TEAM"],
  ] as const)("rejects %s to %s", (from, to) => {
    const inquiry = new InquiryTestBuilder().buildReconstituted({status: from});
    expect(() => inquiry.transitionTo(to, new Date("2026-01-02T00:00:00.000Z"))).toThrow(InquiryTransitionError);
  });

  it("rejects an arbitrary status at runtime", () => {
    const inquiry = new InquiryTestBuilder().buildNew();
    expect(() => inquiry.transitionTo("ESCALATED" as InquiryStatus, new Date("2026-01-02T00:00:00.000Z"))).toThrow(InquiryTransitionError);
  });

  it("requires status timestamps to advance so updatedAt remains a usable version", () => {
    const inquiry = new InquiryTestBuilder().buildNew();
    expect(() => inquiry.transitionTo("WAITING_FOR_TEAM", inquiry.updatedAt)).toThrow(InquiryTransitionError);
  });

  it("assigns, reassigns, and unassigns through active provider-neutral references", () => {
    const assignment = InquiryAssignment.unassigned("test-inquiry-1");
    expect(assignment.assignTo(TeamMember.reconstitute("member-1", true), new Date("2026-01-02T00:00:00.000Z"))).toBe(true);
    expect(assignment.teamMemberId).toBe("member-1");
    expect(assignment.assignTo(TeamMember.reconstitute("member-2", true), new Date("2026-01-03T00:00:00.000Z"))).toBe(true);
    expect(assignment.unassign(new Date("2026-01-04T00:00:00.000Z"))).toBe(true);
    expect(assignment.teamMemberId).toBeNull();
  });

  it("rejects inactive members and non-advancing assignment timestamps", () => {
    const assignment = InquiryAssignment.unassigned("test-inquiry-1");
    expect(() => assignment.assignTo(TeamMember.reconstitute("member-1", false), new Date())).toThrow(InquiryAssignmentError);
    assignment.assignTo(TeamMember.reconstitute("member-1", true), new Date("2026-01-03T00:00:00.000Z"));
    expect(() => assignment.unassign(new Date("2026-01-02T00:00:00.000Z"))).toThrow(InquiryAssignmentError);
    expect(() => assignment.unassign(new Date("2026-01-03T00:00:00.000Z"))).toThrow(InquiryAssignmentError);
  });

  it("creates immutable status and assignment history values", () => {
    const statusEvent = createStatusChangedWorkflowEvent("test-inquiry-1", "NEW", "WAITING_FOR_TEAM", "TEAM:member-1", new Date("2026-01-02T00:00:00.000Z"));
    const assignmentEvent = createAssignmentWorkflowEvent("test-inquiry-1", null, "member-1", null, new Date("2026-01-02T00:00:00.000Z"));
    expect(statusEvent).toEqual({inquiryId:"test-inquiry-1",type:"STATUS_CHANGED",previousValue:"NEW",newValue:"WAITING_FOR_TEAM",actorReference:"TEAM:member-1",occurredAt:"2026-01-02T00:00:00.000Z"});
    expect(assignmentEvent.type).toBe("ASSIGNED");
    expect(Object.isFrozen(statusEvent)).toBe(true);
  });
});
