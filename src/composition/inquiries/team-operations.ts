import "server-only";

import {getInquiryRepository} from "@/composition/inquiries/inquiry-persistence";
import {AssignInquiry} from "@/features/inquiries/application/use-cases/assign-inquiry";
import {ChangeInquiryStatus} from "@/features/inquiries/application/use-cases/change-inquiry-status";
import {GetTeamInquiryDetail} from "@/features/inquiries/application/use-cases/get-team-inquiry-detail";
import {ListAssignableTeamMembers} from "@/features/inquiries/application/use-cases/list-assignable-team-members";
import {ListTeamInquiries} from "@/features/inquiries/application/use-cases/list-team-inquiries";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresInquiryWorkflowRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-workflow-repository";
import {PostgresTeamOperationsReadRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-team-operations-read-repository";

export type TeamOperations = Readonly<{
  listInquiries: ListTeamInquiries;
  getInquiryDetail: GetTeamInquiryDetail;
  listAssignableTeamMembers: ListAssignableTeamMembers;
  assignInquiry: AssignInquiry;
  changeInquiryStatus: ChangeInquiryStatus;
}>;

let teamOperations: TeamOperations | undefined;

export function getTeamOperations(): TeamOperations {
  if (teamOperations) return teamOperations;
  const pool = getInquiryPostgresPool();
  const inquiries = getInquiryRepository();
  const workflow = new PostgresInquiryWorkflowRepository(pool);
  const messages = new PostgresConversationMessageRepository(pool);
  const reader = new PostgresTeamOperationsReadRepository(pool);
  const clock = {now: () => new Date()};

  teamOperations = Object.freeze({
    listInquiries: new ListTeamInquiries(reader),
    getInquiryDetail: new GetTeamInquiryDetail(reader, workflow, messages),
    listAssignableTeamMembers: new ListAssignableTeamMembers(reader),
    assignInquiry: new AssignInquiry(inquiries, workflow, clock),
    changeInquiryStatus: new ChangeInquiryStatus(inquiries, workflow, clock),
  });
  return teamOperations;
}
