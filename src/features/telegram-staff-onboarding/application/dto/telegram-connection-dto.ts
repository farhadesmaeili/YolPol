import type {StaffCapabilities} from "@/features/staff-authentication/application/dto/staff-capabilities";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";

export type TelegramConnectionStateDto =
  | Readonly<{status: "not_connected" | "connected"}>
  | Readonly<{status: "pending"; expiresAt: string}>;

export type TelegramStaffActorDto = Readonly<{
  principal: StaffPrincipal;
  capabilities: StaffCapabilities;
}>;
