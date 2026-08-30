import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";
import type {ConsumeTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/consume-telegram-connection-request";
import {presentTelegramOnboardingBotMessage} from "@/features/telegram-staff-onboarding/presentation/presenters/telegram-onboarding-bot-messages";

export type TelegramOnboardingResponseTransport = Readonly<{
  send(input: Readonly<{chatId: string; text: string}>): Promise<void>;
}>;

const connectionTokenPattern = /^ypt_[A-Za-z0-9_-]{43}$/u;

export class TelegramStaffConnectionCommandHandler {
  constructor(
    private readonly consumeConnectionRequest: Pick<ConsumeTelegramConnectionRequest, "execute">,
    private readonly transport: TelegramOnboardingResponseTransport,
  ) {}

  async execute(command: TelegramStartCommand): Promise<void> {
    const connectionToken = command.connectionToken;
    if (!connectionToken && !command.malformed) {
      if (command.chatId) await this.sendSafely(command.chatId, presentTelegramOnboardingBotMessage(command, "unknownStart"));
      return;
    }

    let connected = false;
    if (!command.malformed && command.senderEligible && command.chatType === "private" && command.telegramUserId && command.chatId
      && connectionToken && connectionTokenPattern.test(connectionToken)) {
      const result = await this.consumeConnectionRequest.execute({
        connectionToken,
        telegramUserId: command.telegramUserId,
        privateChatId: command.chatId,
      });
      connected = result.status === "connected";
    }

    if (command.chatId) {
      await this.sendSafely(command.chatId, presentTelegramOnboardingBotMessage(command, connected ? "connected" : "invalidLink"));
    }
  }

  private async sendSafely(chatId: string, text: string): Promise<void> {
    try { await this.transport.send({chatId, text}); }
    catch { /* A provider failure cannot undo an already committed identity link. */ }
  }
}
