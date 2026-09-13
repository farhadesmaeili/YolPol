import {beforeEach, describe, expect, it} from "vitest";

import {AssignInquiry} from "@/features/inquiries/application/use-cases/assign-inquiry";
import {ChangeInquiryStatus} from "@/features/inquiries/application/use-cases/change-inquiry-status";
import {ReadInquiryWorkflowHistory} from "@/features/inquiries/application/use-cases/read-inquiry-workflow-history";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
import {FakeClock, FakeInquiryRepository, FakeInquiryWorkflowRepository} from "@/features/inquiries/testing/fakes/inquiry-fakes";

describe("Inquiry team workflow use cases", () => {
  const inquiryId = "workflow-inquiry";
  let inquiries: FakeInquiryRepository;
  let workflow: FakeInquiryWorkflowRepository;
  let clock: FakeClock;

  beforeEach(async () => {
    inquiries = new FakeInquiryRepository();
    workflow = new FakeInquiryWorkflowRepository();
    clock = new FakeClock(new Date("2026-02-01T12:00:00.000Z"), 1_000);
    await inquiries.save(new InquiryTestBuilder().with({id: inquiryId}).buildNew());
  });

  it("changes status only through a valid domain transition and records history", async () => {
    const result = await new ChangeInquiryStatus(inquiries, workflow, clock).execute({inquiryId, status:"WAITING_FOR_TEAM", actorReference:"TEAM:member-1"});
    expect(result).toEqual({status:"changed",inquiryStatus:"WAITING_FOR_TEAM"});
    expect(workflow.events).toEqual([expect.objectContaining({type:"STATUS_CHANGED",previousValue:"NEW",newValue:"WAITING_FOR_TEAM",actorReference:"TEAM:member-1"})]);
    expect(workflow.statusSnapshots[0]).toEqual({status:"NEW",updatedAt:new Date("2026-01-01T00:00:00.000Z")});
  });

  it("rejects invalid transitions without creating history", async () => {
    const result = await new ChangeInquiryStatus(inquiries, workflow, clock).execute({inquiryId, status:"CONFIRMED"});
    expect(result).toEqual({status:"invalid_transition"});
    expect(workflow.events).toHaveLength(0);
  });

  it("assigns, reassigns, and unassigns with an event for each change", async () => {
    workflow.addTeamMember("member-1");
    workflow.addTeamMember("member-2");
    const useCase = new AssignInquiry(inquiries, workflow, clock);
    await expect(useCase.execute({inquiryId,teamMemberId:"member-1"})).resolves.toEqual({status:"assigned",teamMemberId:"member-1"});
    await expect(useCase.execute({inquiryId,teamMemberId:"member-2",actorReference:"TEAM:lead"})).resolves.toEqual({status:"assigned",teamMemberId:"member-2"});
    await expect(useCase.execute({inquiryId,teamMemberId:null})).resolves.toEqual({status:"unassigned"});
    expect(workflow.events.map(({type,previousValue,newValue}) => ({type,previousValue,newValue}))).toEqual([
      {type:"ASSIGNED",previousValue:null,newValue:"member-1"},
      {type:"ASSIGNED",previousValue:"member-1",newValue:"member-2"},
      {type:"UNASSIGNED",previousValue:"member-2",newValue:null},
    ]);
    expect(workflow.assignmentSnapshots).toEqual([
      {teamMemberId:null,changedAt:null},
      {teamMemberId:"member-1",changedAt:new Date("2026-02-01T12:00:00.000Z")},
      {teamMemberId:"member-2",changedAt:new Date("2026-02-01T12:00:01.000Z")},
    ]);
  });

  it("rejects inactive and unknown team members", async () => {
    workflow.addTeamMember("inactive-member", false);
    const useCase = new AssignInquiry(inquiries, workflow, clock);
    await expect(useCase.execute({inquiryId,teamMemberId:"inactive-member"})).resolves.toEqual({status:"team_member_inactive"});
    await expect(useCase.execute({inquiryId,teamMemberId:"missing-member"})).resolves.toEqual({status:"team_member_not_found"});
    expect(workflow.events).toHaveLength(0);
  });

  it("reads immutable inquiry history in repository order", async () => {
    workflow.seedEvent(Object.freeze({id:"1",inquiryId,type:"INQUIRY_CREATED",previousValue:null,newValue:"NEW",actorReference:null,occurredAt:"2026-01-01T00:00:00.000Z"}));
    const result = await new ReadInquiryWorkflowHistory(inquiries, workflow).execute({inquiryId});
    expect(result).toEqual({status:"found",events:[expect.objectContaining({id:"1",type:"INQUIRY_CREATED"})]});
    if (result.status === "found") expect(Object.isFrozen(result.events)).toBe(true);
  });
});
