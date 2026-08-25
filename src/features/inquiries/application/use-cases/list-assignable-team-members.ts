import type {TeamOperationsReadRepository} from "@/features/inquiries/application/ports/team-operations-read-port";
import type {ListAssignableTeamMembersResult} from "@/features/inquiries/application/results/team-operations-results";

export class ListAssignableTeamMembers {
  constructor(private readonly reader: TeamOperationsReadRepository) {}

  async execute(): Promise<ListAssignableTeamMembersResult> {
    try {
      const teamMembers = await this.reader.listTeamMembers({activeOnly: true});
      return Object.freeze({status: "found", teamMembers: Object.freeze([...teamMembers])});
    } catch { return {status: "persistence_failed"}; }
  }
}
