import {getTelegramReplyGateway, getTelegramWebhookSecret} from "@/composition/inquiries/telegram-reply-gateway";
import {createTelegramWebhookHandler} from "@/features/inquiries/infrastructure/http/telegram-webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createTelegramWebhookHandler(getTelegramReplyGateway, getTelegramWebhookSecret);
