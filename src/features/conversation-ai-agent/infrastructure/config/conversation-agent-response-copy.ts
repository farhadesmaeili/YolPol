import type {ConversationAgentResponseCopy} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import type {Locale} from "@/shared/types/locale";

export const conversationAgentResponseCopy: Readonly<Record<Locale, ConversationAgentResponseCopy>> = {
  en: {
    social: "Hello, and thank you for your message.", unconfirmed: "Any details not listed here require confirmation by our sales team.",
    product: "Product", sku: "SKU", capacityMl: "Volume (ml)", glassColor: "Glass color", bottleShape: "Shape", neckFinish: "Neck finish",
    weightGrams: "Bottle weight (g)", heightMm: "Height (mm)", diameterMm: "Diameter (mm)",
    unitsPerPackage: "Units per package", packagesPerPallet: "Packages per pallet", unitsPerPallet: "Units per pallet", palletGrossWeightKg: "Gross pallet weight (kg)",
    referenceLoadPallets: "Reference load (pallets; planning only)", unitsPerReferenceLoad: "Units per reference load (planning only)",
    email: "Email", phones: "Phone", whatsapp: "WhatsApp", location: "Location", address: "Office address",
    colors: {"olive-green": "Olive green", clear: "Clear"}, shapes: {round: "Round", square: "Square"},
  },
  tr: {
    social: "Merhaba, mesajınız için teşekkür ederiz.", unconfirmed: "Burada belirtilmeyen ayrıntılar satış ekibimizin teyidini gerektirir.",
    product: "Ürün", sku: "Stok kodu", capacityMl: "Hacim (ml)", glassColor: "Cam rengi", bottleShape: "Şekil", neckFinish: "Ağız tipi",
    weightGrams: "Şişe ağırlığı (g)", heightMm: "Yükseklik (mm)", diameterMm: "Çap (mm)",
    unitsPerPackage: "Paket başına adet", packagesPerPallet: "Palet başına paket", unitsPerPallet: "Palet başına adet", palletGrossWeightKg: "Brüt palet ağırlığı (kg)",
    referenceLoadPallets: "Referans yük (palet; yalnızca planlama)", unitsPerReferenceLoad: "Referans yük başına adet (yalnızca planlama)",
    email: "E-posta", phones: "Telefon", whatsapp: "WhatsApp", location: "Konum", address: "Ofis adresi",
    colors: {"olive-green": "Zeytin yeşili", clear: "Şeffaf"}, shapes: {round: "Yuvarlak", square: "Kare"},
  },
  fa: {
    social: "سلام، از پیام شما سپاسگزاریم.", unconfirmed: "جزئیاتی که اینجا ذکر نشده‌اند نیاز به تأیید تیم فروش ما دارند.",
    product: "محصول", sku: "کد کالا", capacityMl: "حجم (میلی‌لیتر)", glassColor: "رنگ شیشه", bottleShape: "شکل", neckFinish: "نوع دهانه",
    weightGrams: "وزن بطری (گرم)", heightMm: "ارتفاع (میلی‌متر)", diameterMm: "قطر (میلی‌متر)",
    unitsPerPackage: "تعداد در بسته", packagesPerPallet: "بسته در پالت", unitsPerPallet: "تعداد در پالت", palletGrossWeightKg: "وزن ناخالص پالت (کیلوگرم)",
    referenceLoadPallets: "بار مرجع (پالت؛ فقط برای برنامه‌ریزی)", unitsPerReferenceLoad: "تعداد در بار مرجع (فقط برای برنامه‌ریزی)",
    email: "ایمیل", phones: "تلفن", whatsapp: "واتس‌اپ", location: "موقعیت", address: "نشانی دفتر",
    colors: {"olive-green": "سبز زیتونی", clear: "شفاف"}, shapes: {round: "گرد", square: "مربع"},
  },
  ar: {
    social: "مرحبًا، شكرًا لرسالتك.", unconfirmed: "أي تفاصيل غير مذكورة هنا تتطلب تأكيد فريق المبيعات لدينا.",
    product: "المنتج", sku: "رمز الصنف", capacityMl: "السعة (مل)", glassColor: "لون الزجاج", bottleShape: "الشكل", neckFinish: "نوع العنق",
    weightGrams: "وزن الزجاجة (غ)", heightMm: "الارتفاع (مم)", diameterMm: "القطر (مم)",
    unitsPerPackage: "الوحدات في العبوة", packagesPerPallet: "العبوات في المنصة", unitsPerPallet: "الوحدات في المنصة", palletGrossWeightKg: "الوزن الإجمالي للمنصة (كغ)",
    referenceLoadPallets: "الحمولة المرجعية (منصات؛ للتخطيط فقط)", unitsPerReferenceLoad: "الوحدات في الحمولة المرجعية (للتخطيط فقط)",
    email: "البريد الإلكتروني", phones: "الهاتف", whatsapp: "واتساب", location: "الموقع", address: "عنوان المكتب",
    colors: {"olive-green": "أخضر زيتوني", clear: "شفاف"}, shapes: {round: "دائري", square: "مربع"},
  },
};
