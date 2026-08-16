import {ProductGallery} from "@/features/products/presentation/components/product-gallery";
import {
  ProductPackaging,
  type ProductPackagingLabels,
} from "@/features/products/presentation/components/product-packaging";
import {ProductSpecifications} from "@/features/products/presentation/components/product-specifications";
import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {Link} from "@/i18n/navigation";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

type ProductDetailLabels = Readonly<{
  categories: string;
  sku: string;
  applications: string;
  categoryNames: readonly string[];
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
    <article className="mt-8">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <ProductGallery images={product.images} />
        <div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-emerald-800">
            {labels.categoryNames.map((categoryName) => (
              <li key={categoryName}>{categoryName}</li>
            ))}
          </ul>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            {product.content.name}
          </h1>
          <p className="mt-5 text-lg leading-8 text-stone-700">
            {product.content.shortDescription}
          </p>
          <dl className="mt-7 grid gap-4 rounded-xl bg-stone-100 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-stone-600">{labels.categories}</dt>
              <dd className="mt-1 font-medium text-stone-950">
                <ul className="space-y-1">
                  {labels.categoryNames.map((categoryName) => (
                    <li key={categoryName}>{categoryName}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-stone-600">{labels.sku}</dt>
              <dd className="mt-1 font-medium text-stone-950"><LtrIsolate>{product.identity.sku}</LtrIsolate></dd>
            </div>
          </dl>
          <p className="mt-5 font-medium text-emerald-900">{labels.inquiryPricing}</p>
          <Link href={`/inquiry?product=${encodeURIComponent(product.identity.id)}`} className="mt-5 inline-flex min-h-11 items-center bg-emerald-900 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{labels.requestAction}</Link>
        </div>
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <section aria-labelledby="product-description-heading">
          <h2 id="product-description-heading" className="sr-only">
            {product.content.name}
          </h2>
          <p className="whitespace-pre-line leading-8 text-stone-700">
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
        <ProductSpecifications
          specifications={product.specifications}
          labels={labels.specifications}
          locale={locale}
        />
        {product.packaging ? (
          <ProductPackaging packaging={product.packaging} labels={labels.packaging} locale={locale} />
        ) : null}
      </div>
    </article>
  );
}
