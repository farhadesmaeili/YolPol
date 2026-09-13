import type {TelegramConnectionStateDto} from "@/features/telegram-staff-onboarding/application/dto/telegram-connection-dto";

export type TelegramConnectionViewModel = Readonly<{
  status: "CONNECTED" | "NOT_CONNECTED" | "PENDING";
  pendingExpiresAt?: string;
}>;

export function presentTelegramConnection(state: TelegramConnectionStateDto): TelegramConnectionViewModel {
  if (state.status === "connected") return {status: "CONNECTED"};
  if (state.status === "pending") return {status: "PENDING", pendingExpiresAt: state.expiresAt};
  return {status: "NOT_CONNECTED"};
}
