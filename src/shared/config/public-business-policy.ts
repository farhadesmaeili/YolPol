import type {Locale} from "@/shared/types/locale";

type LocalizedPublicBusinessPolicy = Readonly<{
  inquiryProcess: readonly string[];
  pickupProcess: readonly string[];
  staffReviewResponse: string;
  pricingReviewResponse: string;
}>;

export const publicBusinessPolicy: Readonly<Record<Locale, LocalizedPublicBusinessPolicy>> = Object.freeze({
  en: Object.freeze({
    inquiryProcess: Object.freeze(["YOLPOL supplies products to business buyers through a wholesale inquiry process.", "Published Product specifications and requested quantities are reviewed before pricing and commercial terms are confirmed by Staff."]),
    pickupProcess: Object.freeze(["YOLPOL is a wholesale supplier, not a freight or logistics provider.", "The buyer arranges the vehicle, transportation, and pickup. Actual vehicle and legal limits must be confirmed for the specific arrangement."]),
    staffReviewResponse: "This request requires review by our sales team. A YOLPOL team member will follow up.",
    pricingReviewResponse: "Product pricing is provided through a wholesale inquiry and requires confirmation by our sales team. A YOLPOL team member will follow up.",
  }),
  tr: Object.freeze({
    inquiryProcess: Object.freeze(["YOLPOL, ticari alıcılara toptan satış talep süreciyle ürün tedarik eder.", "Yayımlanmış ürün özellikleri ve talep edilen miktarlar incelendikten sonra fiyat ve ticari koşullar Personel tarafından teyit edilir."]),
    pickupProcess: Object.freeze(["YOLPOL bir toptan ürün tedarikçisidir; nakliye veya lojistik hizmeti sunmaz.", "Araç, taşıma ve teslim alma düzenlemesini alıcı yapar. Gerçek araç ve yasal sınırlar ilgili düzenleme için teyit edilmelidir."]),
    staffReviewResponse: "Bu talebin satış ekibimiz tarafından incelenmesi gerekiyor. YOLPOL ekibinden bir görevli konuyu takip edecektir.",
    pricingReviewResponse: "Ürün fiyatı toptan satış talebi üzerinden sağlanır ve satış ekibimizin onayını gerektirir. YOLPOL ekibinden bir görevli konuyu takip edecektir.",
  }),
  fa: Object.freeze({
    inquiryProcess: Object.freeze(["YOLPOL محصولات را از طریق فرایند استعلام عمده‌فروشی به خریداران تجاری عرضه می‌کند.", "مشخصات محصولات منتشرشده و مقدار درخواستی بررسی می‌شود و سپس قیمت و شرایط تجاری توسط کارکنان تأیید می‌گردد."]),
    pickupProcess: Object.freeze(["YOLPOL تأمین‌کننده عمده‌فروشی است و شرکت حمل‌ونقل یا لجستیک نیست.", "هماهنگی خودرو، حمل و تحویل‌گیری بر عهده خریدار است. محدودیت‌های واقعی خودرو و قانونی باید برای هر هماهنگی تأیید شوند."]),
    staffReviewResponse: "این درخواست نیاز به بررسی تیم فروش ما دارد. یکی از اعضای تیم YOLPOL موضوع را پیگیری خواهد کرد.",
    pricingReviewResponse: "قیمت محصول از طریق استعلام عمده‌فروشی ارائه می‌شود و نیاز به تأیید تیم فروش ما دارد. یکی از اعضای تیم YOLPOL موضوع را پیگیری خواهد کرد.",
  }),
  ar: Object.freeze({
    inquiryProcess: Object.freeze(["تورّد YOLPOL المنتجات للمشترين التجاريين من خلال عملية استفسار للبيع بالجملة.", "تُراجع مواصفات المنتجات المنشورة والكميات المطلوبة، ثم يؤكد الموظفون السعر والشروط التجارية."]),
    pickupProcess: Object.freeze(["YOLPOL مورّد جملة وليست شركة شحن أو خدمات لوجستية.", "يرتب المشتري المركبة والنقل والاستلام. يجب تأكيد حدود المركبة والمتطلبات القانونية الفعلية لكل ترتيب."]),
    staffReviewResponse: "يتطلب هذا الطلب مراجعة فريق المبيعات لدينا. سيتابع أحد أعضاء فريق YOLPOL الموضوع.",
    pricingReviewResponse: "يُقدَّم سعر المنتج من خلال استفسار البيع بالجملة ويتطلب تأكيد فريق المبيعات لدينا. سيتابع أحد أعضاء فريق YOLPOL الموضوع.",
  }),
});
