import Image from "next/image";

import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {Link} from "@/i18n/navigation";

export function ProductCard({
  product,
  categoryLabels,
  viewLabel,
  inquiryLabel,
}: {
  product: ProductViewModel;
  categoryLabels: readonly string[];
  viewLabel: string;
  inquiryLabel: string;
}) {
  const image = product.images.find(
    (candidate) => candidate.isPrimary && candidate.alternativeText,
  );

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {image ? (
        <div className="relative aspect-square bg-stone-100">
          <Image
            src={image.source}
            alt={image.alternativeText ?? ""}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className="object-contain p-6"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-emerald-800">
          {categoryLabels.map((categoryLabel) => (
            <li key={categoryLabel}>{categoryLabel}</li>
          ))}
        </ul>
        <h2 className="mt-2 text-xl font-semibold text-stone-950">
          {product.content.name}
        </h2>
        <p className="mt-3 line-clamp-3 leading-7 text-stone-600">
          {product.content.shortDescription}
        </p>
        <Link href={`/inquiry?product=${encodeURIComponent(product.identity.id)}`} className="mt-4 inline-flex w-fit text-sm font-semibold text-emerald-900 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700">{inquiryLabel}</Link>
        <Link
          href={`/products/${product.identity.slug}`}
          aria-label={`${viewLabel}: ${product.content.name}`}
          className="mt-6 inline-flex w-fit text-sm font-semibold text-emerald-900 outline-none underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          {viewLabel}
        </Link>
      </div>
    </article>
  );
}
