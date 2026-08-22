import { ProductCardActions } from "@/features/products/presentation/components/product-card/product-card-actions";
import { ProductCardContent } from "@/features/products/presentation/components/product-card/product-card-content";
import { selectProductCardImage } from "@/features/products/presentation/components/product-card/product-card-image";
import { ProductCardVisual } from "@/features/products/presentation/components/product-card/product-card-visual";
import type { ProductViewModel } from "@/features/products/presentation/view-models/product-view-model";

export type ProductCardLabels = Readonly<{
  product: string;
  glassBottle: string;
  inquiryPricing: string;
  missingImage: string;
}>;

export function ProductCard({
  product,
  categoryLabels,
  viewLabel,
  inquiryLabel,
  labels,
}: {
  product: ProductViewModel;
  categoryLabels: readonly string[];
  viewLabel: string;
  inquiryLabel: string;
  labels: ProductCardLabels;
}) {
  const image = selectProductCardImage(product.images);
  const isRtl = product.content.locale === "fa" || product.content.locale === "ar";

  return (
    <article
      data-product-card=""
      dir={isRtl ? "rtl" : "ltr"}
      className="group relative isolate flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-stone-950/[0.09] bg-[#f8f7f2] shadow-[0_22px_70px_-45px_rgba(28,25,23,0.30)] transition-[border-color,box-shadow,background-color] duration-700 hover:border-emerald-900/[0.16] hover:bg-[#faf9f5] hover:shadow-[0_34px_95px_-48px_rgba(6,78,59,0.24)] motion-reduce:transition-none sm:rounded-[2rem]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 z-0 size-72 max-w-[80%] rounded-full bg-emerald-700/[0.045] blur-3xl transition-[background-color,opacity] duration-1000 group-hover:bg-emerald-700/[0.075] motion-reduce:transition-none" />

      <ProductCardVisual
        image={image}
        productName={product.content.name}
        productLabel={labels.product}
        glassBottleLabel={labels.glassBottle}
        inquiryPricingLabel={labels.inquiryPricing}
        missingImageLabel={labels.missingImage}
        isRtl={isRtl}
      />

      <div className="relative z-10 flex flex-1 flex-col px-5 pb-5 pt-6 sm:px-7 sm:pb-7">
        <ProductCardContent
          name={product.content.name}
          description={product.content.shortDescription}
          categoryLabels={categoryLabels}
          isRtl={isRtl}
        />
        <ProductCardActions
          productId={product.identity.id}
          productSlug={product.identity.slug}
          productName={product.content.name}
          viewLabel={viewLabel}
          inquiryLabel={inquiryLabel}
          isRtl={isRtl}
        />

        <div aria-hidden="true" dir="ltr" className="mt-5 flex items-center justify-between border-t border-stone-950/[0.07] pt-4 text-[7px] font-semibold uppercase tracking-[0.18em] text-stone-400 sm:tracking-[0.22em]">
          <span>YOLPOL / GLASS</span><span>B2B / INTL</span>
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/60 transition-shadow duration-700 group-hover:shadow-[inset_0_0_0_1px_rgba(6,78,59,0.055)] motion-reduce:transition-none" />
    </article>
  );
}
