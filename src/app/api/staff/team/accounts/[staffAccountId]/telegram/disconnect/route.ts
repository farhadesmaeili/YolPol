import {handleForceDisconnectStaffTelegram} from "@/composition/telegram-staff-onboarding/telegram-staff-onboarding-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleForceDisconnectStaffTelegram;
