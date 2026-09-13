import type {StaticLocalizedProductRecord} from "@/features/products/infrastructure/data/static-product-records";

type ProductFact = Readonly<{
  id: string;
  capacityMl: 250 | 500 | 700;
  glassColor: "olive-green" | "clear";
  bottleShape: "round" | "square";
}>;

const products: readonly ProductFact[] = [
  {id: "ylp-gb-250-og-rd", capacityMl: 250, glassColor: "olive-green", bottleShape: "round"},
  {id: "ylp-gb-250-og-sq", capacityMl: 250, glassColor: "olive-green", bottleShape: "square"},
  {id: "ylp-gb-250-cl-rd", capacityMl: 250, glassColor: "clear", bottleShape: "round"},
  {id: "ylp-gb-250-cl-sq", capacityMl: 250, glassColor: "clear", bottleShape: "square"},
  {id: "ylp-gb-500-og-rd", capacityMl: 500, glassColor: "olive-green", bottleShape: "round"},
  {id: "ylp-gb-500-og-sq", capacityMl: 500, glassColor: "olive-green", bottleShape: "square"},
  {id: "ylp-gb-500-cl-rd", capacityMl: 500, glassColor: "clear", bottleShape: "round"},
  {id: "ylp-gb-500-cl-sq", capacityMl: 500, glassColor: "clear", bottleShape: "square"},
  {id: "ylp-gb-700-og-rd", capacityMl: 700, glassColor: "olive-green", bottleShape: "round"},
];

export const localizedProducts: readonly StaticLocalizedProductRecord[] =
  products.flatMap((product) => [
    englishContent(product),
    turkishContent(product),
    persianContent(product),
    arabicContent(product),
  ]);

function englishContent(product: ProductFact): StaticLocalizedProductRecord {
  const color = product.glassColor === "olive-green" ? "Olive Green" : "Clear";
  const shape = product.bottleShape === "round" ? "Round" : "Square";
  const name = `${product.capacityMl}ml ${color} ${shape} Glass Bottle`;
  return localizedRecord(product, "en", {
    name,
    shortDescription: `${product.capacityMl}ml ${product.glassColor === "olive-green" ? "olive-green" : "clear"} glass bottle with a ${product.bottleShape} shape.`,
    fullDescription: `A ${product.capacityMl}ml ${product.bottleShape} bottle made from ${product.glassColor === "olive-green" ? "olive-green" : "clear"} glass. It is listed in the olive oil, food, and beverage categories. Price is available by inquiry.`,
    applications: ["Olive oil packaging", "Food packaging", "Beverage packaging"],
    seoTitle: `${name} | YolPol`,
    seoDescription: `${product.capacityMl}ml ${product.glassColor === "olive-green" ? "olive-green" : "clear"} ${product.bottleShape} glass bottle for olive oil, food, and beverage categories. Price by inquiry.`,
    alternativeText: `${name} product image`,
  });
}

function turkishContent(product: ProductFact): StaticLocalizedProductRecord {
  const color = product.glassColor === "olive-green" ? "Zeytin Yeşili" : "Şeffaf";
  const shape = product.bottleShape === "round" ? "Yuvarlak" : "Kare";
  const name = `${product.capacityMl} ml ${color} ${shape} Cam Şişe`;
  return localizedRecord(product, "tr", {
    name,
    shortDescription: `${product.capacityMl} ml kapasiteli, ${color.toLocaleLowerCase("tr-TR")} camdan ${shape.toLocaleLowerCase("tr-TR")} şişe.`,
    fullDescription: `${product.capacityMl} ml kapasiteli, ${shape.toLocaleLowerCase("tr-TR")} biçimli ve ${color.toLocaleLowerCase("tr-TR")} cam şişe. Zeytinyağı, gıda ve içecek kategorilerinde listelenir. Fiyat bilgisi talep üzerine sunulur.`,
    applications: ["Zeytinyağı ambalajı", "Gıda ambalajı", "İçecek ambalajı"],
    seoTitle: `${name} | YolPol`,
    seoDescription: `Zeytinyağı, gıda ve içecek kategorileri için ${product.capacityMl} ml ${color.toLocaleLowerCase("tr-TR")} ${shape.toLocaleLowerCase("tr-TR")} cam şişe. Fiyat için iletişime geçin.`,
    alternativeText: `${name} ürün görseli`,
  });
}

function persianContent(product: ProductFact): StaticLocalizedProductRecord {
  const capacity = toPersianDigits(product.capacityMl);
  const color = product.glassColor === "olive-green" ? "سبز زیتونی" : "شفاف";
  const shape = product.bottleShape === "round" ? "گرد" : "مربعی";
  const name = `بطری شیشه‌ای ${shape} ${color} ${capacity} میلی‌لیتری`;
  return localizedRecord(product, "fa", {
    name,
    shortDescription: `بطری شیشه‌ای ${shape} ${color} با ظرفیت ${capacity} میلی‌لیتر.`,
    fullDescription: `بطری ${shape} از شیشه ${color} با ظرفیت ${capacity} میلی‌لیتر. این محصول در دسته‌های روغن زیتون، مواد غذایی و نوشیدنی قرار دارد. قیمت بنا به درخواست ارائه می‌شود.`,
    applications: ["بسته‌بندی روغن زیتون", "بسته‌بندی مواد غذایی", "بسته‌بندی نوشیدنی"],
    seoTitle: `${name} | یول‌پل`,
    seoDescription: `بطری شیشه‌ای ${shape} ${color} ${capacity} میلی‌لیتری برای دسته‌های روغن زیتون، مواد غذایی و نوشیدنی. قیمت بنا به درخواست.`,
    alternativeText: `تصویر ${name}`,
  });
}

function arabicContent(product: ProductFact): StaticLocalizedProductRecord {
  const color = product.glassColor === "olive-green" ? "خضراء زيتونية" : "شفافة";
  const shape = product.bottleShape === "round" ? "دائرية" : "مربعة";
  const name = `زجاجة زجاجية ${shape} ${color} سعة ${product.capacityMl} مل`;
  return localizedRecord(product, "ar", {
    name,
    shortDescription: `زجاجة من الزجاج ${product.glassColor === "olive-green" ? "الأخضر الزيتوني" : "الشفاف"} بشكل ${product.bottleShape === "round" ? "دائري" : "مربع"} وسعة ${product.capacityMl} مل.`,
    fullDescription: `زجاجة بشكل ${product.bottleShape === "round" ? "دائري" : "مربع"} من الزجاج ${product.glassColor === "olive-green" ? "الأخضر الزيتوني" : "الشفاف"} بسعة ${product.capacityMl} مل. تندرج ضمن فئات زيت الزيتون والأغذية والمشروبات. السعر متاح عند الطلب.`,
    applications: ["تعبئة زيت الزيتون", "تعبئة الأغذية", "تعبئة المشروبات"],
    seoTitle: `${name} | يول بول`,
    seoDescription: `زجاجة زجاجية ${shape} ${color} سعة ${product.capacityMl} مل لفئات زيت الزيتون والأغذية والمشروبات. السعر عند الطلب.`,
    alternativeText: `صورة ${name}`,
  });
}

function localizedRecord(
  product: ProductFact,
  locale: StaticLocalizedProductRecord["locale"],
  content: Readonly<{
    name: string;
    shortDescription: string;
    fullDescription: string;
    applications: readonly string[];
    seoTitle: string;
    seoDescription: string;
    alternativeText: string;
  }>,
): StaticLocalizedProductRecord {
  const imageId = `${product.id}-primary`;
  return {
    productId: product.id,
    locale,
    name: content.name,
    shortDescription: content.shortDescription,
    fullDescription: content.fullDescription,
    applications: content.applications,
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    imageAlternativeText: {[imageId]: content.alternativeText},
  };
}

function toPersianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}
