import type {ConsumeTelegramGroupConnectionRequest} from "@/features/notification-destinations/application/use-cases/notification-destination-use-cases";
import {presentTelegramGroupBotMessage} from "@/features/notification-destinations/presentation/presenters/telegram-group-bot-messages";
import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";
import type {TelegramOnboardingResponseTransport} from "@/features/telegram-staff-onboarding/infrastructure/communication/telegram/telegram-staff-connection-command-handler";

const groupTokenPattern = /^ypg_[A-Za-z0-9_-]{43}$/u;

export class TelegramGroupConnectionCommandHandler {
  constructor(
    private readonly consume: Pick<ConsumeTelegramGroupConnectionRequest, "execute">,
    private readonly transport: TelegramOnboardingResponseTransport,
  ) {}

  async execute(command: TelegramStartCommand): Promise<void> {
    const validChat = command.chatType === "group" || command.chatType === "supergroup";
    let authorized = false;
    if (!command.malformed && validChat && command.senderEligible && command.telegramUserId && command.chatId
      && command.chatTitle && command.connectionToken && groupTokenPattern.test(command.connectionToken)) {
      const result = await this.consume.execute({
        connectionToken: command.connectionToken,
        telegramUserId: command.telegramUserId,
        groupChatId: command.chatId,
        displayName: command.chatTitle,
      });
      authorized = result.status === "authorized";
    }
    if (command.chatId) {
      try { await this.transport.send({chatId: command.chatId, text: presentTelegramGroupBotMessage(command, authorized ? "authorized" : "invalid")}); }
      catch { /* A provider failure cannot undo a committed group authorization. */ }
    }
  }
}
