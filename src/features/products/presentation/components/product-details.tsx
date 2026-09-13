import {ProductGallery} from "@/features/products/presentation/components/product-gallery";
import {
  ProductPackaging,
  type ProductPackagingLabels,
} from "@/features/products/presentation/components/product-packaging";
import {ProductSpecifications} from "@/features/products/presentation/components/product-specifications";
import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import type {ProductCategoryItem} from "@/features/products/presentation/presenters/product-category-presenter";
import {Link} from "@/i18n/navigation";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

type ProductDetailLabels = Readonly<{
  categories: string;
  sku: string;
  applications: string;
  categoryItems: readonly ProductCategoryItem[];
  inquiryPricing: string;
  requestAction: string;
  specifications: Parameters<typeof ProductSpecifications>[0]["labels"];
  packaging: ProductPackagingLabels;
}>;

export function ProductDetails({
  product,
  labels,
  locale,
}: {
  product: ProductViewModel;
  labels: ProductDetailLabels;
  locale: Locale;
}) {
  return (
    <article className="mt-8 pb-20 text-start">
      <div className="grid gap-10 border-b border-stone-950/10 pb-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start">
        <ProductGallery images={product.images} />
        <div className="lg:sticky lg:top-36">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-emerald-800">
            {labels.categoryItems.map((category) => (
              <li key={category.id}><ProductCategoryName category={category} /></li>
            ))}
          </ul>
          <h1 className={`mt-5 text-[clamp(2.6rem,5vw,5.5rem)] font-semibold leading-[0.98] text-stone-950 ${locale === "fa" || locale === "ar" ? "" : "tracking-[-0.05em]"}`}>
            {product.content.name}
          </h1>
          <p className="mt-5 text-lg leading-8 text-stone-700">
            {product.content.shortDescription}
          </p>
          <dl className="mt-8 grid gap-px border border-stone-950/10 bg-stone-950/10 sm:grid-cols-2">
            <div className="bg-white/45 p-5">
              <dt className="text-sm text-stone-600">{labels.categories}</dt>
              <dd className="mt-1 font-medium text-stone-950">
                <ul className="space-y-1">
                  {labels.categoryItems.map((category) => (
                    <li key={category.id}><ProductCategoryName category={category} /></li>
                  ))}
                </ul>
              </dd>
            </div>
            <div className="bg-white/45 p-5">
              <dt className="text-sm text-stone-600">{labels.sku}</dt>
              <dd className="mt-1 font-medium text-stone-950"><LtrIsolate>{product.identity.sku}</LtrIsolate></dd>
            </div>
          </dl>
          <p className="mt-5 font-medium text-emerald-900">{labels.inquiryPricing}</p>
          <Link href={`/inquiry?product=${encodeURIComponent(product.identity.id)}`} aria-label={`${labels.requestAction}: ${product.content.name}`} className="mt-6 inline-flex min-h-12 items-center bg-emerald-950 px-7 font-semibold text-white outline-none transition-colors hover:bg-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none">{labels.requestAction}<span aria-hidden="true" className="ms-3 rtl:rotate-180">→</span></Link>
        </div>
      </div>
      <div className="mt-14 grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <section aria-labelledby="product-description-heading">
          <h2 id="product-description-heading" className="sr-only">
            {product.content.name}
          </h2>
          <p className="max-w-3xl whitespace-pre-line text-lg leading-9 text-stone-700">
            {product.content.fullDescription}
          </p>
          <section className="mt-8" aria-labelledby="product-applications-heading">
            <h2 id="product-applications-heading" className="text-2xl font-semibold text-stone-950">
              {labels.applications}
            </h2>
            <ul className="mt-4 list-inside list-disc space-y-2 text-stone-700">
              {product.content.applications.map((application) => (
                <li key={application}>{application}</li>
              ))}
            </ul>
          </section>
        </section>
        <div className="border border-stone-950/10 bg-white/35 p-6 sm:p-8"><ProductSpecifications
          specifications={product.specifications}
          labels={labels.specifications}
          locale={locale}
        /></div>
        {product.packaging ? (
          <div className="border border-stone-950/10 bg-white/35 p-6 sm:p-8 lg:col-start-2"><ProductPackaging packaging={product.packaging} labels={labels.packaging} locale={locale} /></div>
        ) : null}
      </div>
    </article>
  );
}

function ProductCategoryName({category}: {category: ProductCategoryItem}) {
  if (!category.href) return category.name;
  return (
    <Link
      href={category.href}
      className="outline-none underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-700"
    >
      {category.name}
    </Link>
  );
}
