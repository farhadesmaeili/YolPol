import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";

type BotLocale = "en" | "tr" | "fa" | "ar";
type Message = "authorized" | "invalid";

const messages: Readonly<Record<BotLocale, Readonly<Record<Message, string>>>> = Object.freeze({
  en: Object.freeze({authorized: "This group is now authorized for YOLPOL inquiry notifications.", invalid: "This group authorization link is invalid or expired. Create a new link from the Staff Panel."}),
  tr: Object.freeze({authorized: "Bu grup artık YOLPOL talep bildirimleri için yetkilendirildi.", invalid: "Bu grup yetkilendirme bağlantısı geçersiz veya süresi dolmuş. Personel Panelinden yeni bir bağlantı oluşturun."}),
  fa: Object.freeze({authorized: "این گروه اکنون برای اعلان‌های درخواست YOLPOL مجاز است.", invalid: "این پیوند مجوز گروه نامعتبر یا منقضی است. از پنل کارکنان پیوند تازه‌ای بسازید."}),
  ar: Object.freeze({authorized: "هذه المجموعة مخولة الآن لتلقي إشعارات استفسارات YOLPOL.", invalid: "رابط تخويل المجموعة غير صالح أو منتهي الصلاحية. أنشئ رابطاً جديداً من لوحة الموظفين."}),
});

function localeFor(command: TelegramStartCommand): BotLocale {
  const primary = command.languageCode?.trim().toLowerCase().split(/[-_]/u, 1)[0];
  return primary === "tr" || primary === "fa" || primary === "ar" ? primary : "en";
}

export function presentTelegramGroupBotMessage(command: TelegramStartCommand, message: Message): string {
  return messages[localeFor(command)][message];
}
