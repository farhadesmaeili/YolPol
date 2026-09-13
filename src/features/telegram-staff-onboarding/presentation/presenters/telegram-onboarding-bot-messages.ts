import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";

export type TelegramOnboardingBotMessage = "unknownStart" | "invalidLink" | "connected";
type BotLocale = "en" | "tr" | "fa" | "ar";

const messages: Readonly<Record<BotLocale, Readonly<Record<TelegramOnboardingBotMessage, string>>>> = Object.freeze({
  en: Object.freeze({
    unknownStart: "This bot is for authorized YOLPOL staff. Connect Telegram from the Staff Panel.",
    invalidLink: "This connection link is invalid or expired. Create a new connection from the Staff Panel.",
    connected: "Telegram connected successfully.",
  }),
  tr: Object.freeze({
    unknownStart: "Bu bot yetkili YOLPOL personeli içindir. Telegram bağlantısını Personel Panelinden kurun.",
    invalidLink: "Bu bağlantı geçersiz veya süresi dolmuş. Personel Panelinden yeni bir bağlantı oluşturun.",
    connected: "Telegram başarıyla bağlandı.",
  }),
  fa: Object.freeze({
    unknownStart: "این ربات ویژه کارکنان مجاز YOLPOL است. تلگرام را از پنل کارکنان متصل کنید.",
    invalidLink: "این پیوند اتصال نامعتبر یا منقضی است. از پنل کارکنان پیوند تازه‌ای بسازید.",
    connected: "تلگرام با موفقیت متصل شد.",
  }),
  ar: Object.freeze({
    unknownStart: "هذا الروبوت مخصص لموظفي YOLPOL المصرح لهم. اربط تيليجرام من لوحة الموظفين.",
    invalidLink: "رابط الاتصال هذا غير صالح أو منتهي الصلاحية. أنشئ رابطاً جديداً من لوحة الموظفين.",
    connected: "تم ربط تيليجرام بنجاح.",
  }),
});

function localeFor(command: TelegramStartCommand): BotLocale {
  const primary = command.languageCode?.trim().toLowerCase().split(/[-_]/u, 1)[0];
  return primary === "tr" || primary === "fa" || primary === "ar" ? primary : "en";
}

export function presentTelegramOnboardingBotMessage(command: TelegramStartCommand, message: TelegramOnboardingBotMessage): string {
  return messages[localeFor(command)][message];
}
