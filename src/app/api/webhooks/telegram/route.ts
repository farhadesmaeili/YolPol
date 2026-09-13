import {handleTelegramWebhook} from "@/composition/inquiries/telegram-reply-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleTelegramWebhook;
