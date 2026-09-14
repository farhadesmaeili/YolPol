import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";

type Handler = Readonly<{execute(command: TelegramStartCommand): Promise<void>}>;

export class TelegramStartCommandRouter {
  constructor(private readonly staff: Handler, private readonly group: Handler) {}

  execute(command: TelegramStartCommand): Promise<void> {
    return command.connectionToken?.startsWith("ypg_") ? this.group.execute(command) : this.staff.execute(command);
  }
}
