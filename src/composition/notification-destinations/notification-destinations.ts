import "server-only";

import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {
  ConsumeTelegramGroupConnectionRequest,
  CreateTelegramGroupConnectionRequest,
  ListNotificationDestinations,
  RevokeTelegramGroupConnectionRequest,
  SetTeamMemberNotifications,
  SetTelegramGroupDestination,
} from "@/features/notification-destinations/application/use-cases/notification-destination-use-cases";
import {PostgresNotificationDestinationRepository} from "@/features/notification-destinations/infrastructure/persistence/postgres/repositories/postgres-notification-destination-repository";
import {NodeNotificationDestinationIdGenerator, NodeTelegramGroupTokenService} from "@/features/notification-destinations/infrastructure/security/telegram-group-token-service";

export type NotificationDestinationOperations = Readonly<{
  list: ListNotificationDestinations;
  setTeamMember: SetTeamMemberNotifications;
  createGroupRequest: CreateTelegramGroupConnectionRequest;
  revokeGroupRequest: RevokeTelegramGroupConnectionRequest;
  consumeGroupRequest: ConsumeTelegramGroupConnectionRequest;
  setGroup: SetTelegramGroupDestination;
}>;

let operations: NotificationDestinationOperations | undefined;

export function getNotificationDestinationOperations(): NotificationDestinationOperations {
  if (operations) return operations;
  const repository = new PostgresNotificationDestinationRepository(getInquiryPostgresPool());
  const authorization = getStaffAuthentication().authorization;
  const tokens = new NodeTelegramGroupTokenService();
  const ids = new NodeNotificationDestinationIdGenerator();
  operations = Object.freeze({
    list: new ListNotificationDestinations(repository, authorization),
    setTeamMember: new SetTeamMemberNotifications(repository, authorization, ids),
    createGroupRequest: new CreateTelegramGroupConnectionRequest(repository, tokens, authorization, {now: () => new Date()}),
    revokeGroupRequest: new RevokeTelegramGroupConnectionRequest(repository, authorization),
    consumeGroupRequest: new ConsumeTelegramGroupConnectionRequest(repository, tokens, ids, authorization),
    setGroup: new SetTelegramGroupDestination(repository, authorization, ids),
  });
  return operations;
}
