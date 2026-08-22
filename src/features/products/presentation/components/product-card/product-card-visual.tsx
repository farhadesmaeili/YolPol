import Image from "next/image";

import type { ProductViewModel } from "@/features/products/presentation/view-models/product-view-model";

type ProductCardImage = ProductViewModel["images"][number];

export function ProductCardVisual({
  image,
  productName,
  productLabel,
  glassBottleLabel,
  inquiryPricingLabel,
  missingImageLabel,
  isRtl,
}: {
  image?: ProductCardImage;
  productName: string;
  productLabel: string;
  glassBottleLabel: string;
  inquiryPricingLabel: string;
  missingImageLabel: string;
  isRtl: boolean;
}) {
  return (
    <div className="relative isolate aspect-[1/1.05] overflow-hidden border-b border-stone-950/[0.08] bg-[#efeee8]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.58)_30%,rgba(231,229,221,0.62)_70%,rgba(214,211,201,0.84)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(28,25,23,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(28,25,23,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div aria-hidden="true" className="absolute start-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-stone-950/[0.08] to-transparent" />
      <div aria-hidden="true" className="absolute start-0 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-transparent via-stone-950/[0.08] to-transparent" />
      <div aria-hidden="true" className="absolute start-1/2 top-[48%] size-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-700/[0.075] blur-[55px] transition-[background-color,opacity] duration-1000 group-hover:bg-emerald-600/[0.105] motion-reduce:transition-none" />
      <div aria-hidden="true" dir="ltr" className="absolute -end-3 bottom-[-0.12em] select-none text-[clamp(5rem,10vw,8rem)] font-black leading-none tracking-[-0.09em] text-stone-950/[0.035]">YP</div>

      <div className="absolute inset-x-5 top-5 z-30 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-700 opacity-20 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-800 shadow-[0_0_14px_rgba(6,78,59,0.35)]" />
          </span>
          <span className={isRtl ? "truncate text-[10px] font-semibold text-stone-500" : "truncate text-[8px] font-semibold uppercase tracking-[0.2em] text-stone-500"}>{productLabel}</span>
        </div>
        <span className={isRtl ? "shrink-0 text-[10px] font-semibold text-stone-400" : "shrink-0 text-[8px] font-semibold uppercase tracking-[0.18em] text-stone-400"}>{glassBottleLabel}</span>
      </div>

      <ProductCardCorners />

      {image ? (
        <div className="absolute inset-x-[7%] bottom-[5%] top-[10%] z-10">
          <Image
            src={image.source}
            alt={image.alternativeText ?? productName}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className="object-contain p-5 drop-shadow-[0_30px_28px_rgba(28,25,23,0.14)] transition-[filter] duration-1000 group-hover:drop-shadow-[0_34px_30px_rgba(6,78,59,0.15)] motion-reduce:transition-none sm:p-7"
          />
        </div>
      ) : (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8 text-center">
          <div className="flex flex-col items-center gap-3 text-stone-500">
            <span aria-hidden="true" className="h-16 w-8 rounded-t-full rounded-b-lg border border-stone-950/15" />
            <span className={isRtl ? "text-xs font-semibold" : "text-[9px] font-semibold uppercase tracking-[0.2em]"}>{missingImageLabel}</span>
          </div>
        </div>
      )}

      <div aria-hidden="true" className="pointer-events-none absolute start-[18%] top-[-10%] z-20 h-[120%] w-[16%] -rotate-[12deg] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-20 blur-2xl transition-opacity duration-1000 group-hover:opacity-35 motion-reduce:transition-none" />

      <div className="absolute inset-x-5 bottom-5 z-30 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-stone-950/[0.08] bg-white/65 px-3 py-2 backdrop-blur-xl">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-700" />
          <span className={isRtl ? "truncate text-[10px] font-semibold text-stone-600" : "truncate text-[7px] font-bold uppercase tracking-[0.18em] text-stone-600"}>{inquiryPricingLabel}</span>
        </div>
        <div aria-hidden="true" dir="ltr" className="flex shrink-0 items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          <span>IR</span><span className="h-px w-5 bg-stone-950/20" /><span className="text-emerald-800">→</span><span>INTL</span>
        </div>
      </div>
    </div>
  );
}

function ProductCardCorners() {
  return (
    <div aria-hidden="true">
      <span className="absolute start-5 top-14 z-20 h-8 w-8 border-s border-t border-stone-950/20 transition-[border-color,opacity] duration-700 group-hover:border-emerald-900/30 group-hover:opacity-80 motion-reduce:transition-none" />
      <span className="absolute end-5 top-14 z-20 h-8 w-8 border-e border-t border-stone-950/20 transition-[border-color,opacity] duration-700 group-hover:border-emerald-900/30 group-hover:opacity-80 motion-reduce:transition-none" />
      <span className="absolute bottom-5 start-5 z-20 h-8 w-8 border-b border-s border-stone-950/20 transition-[border-color,opacity] duration-700 group-hover:border-emerald-900/30 group-hover:opacity-80 motion-reduce:transition-none" />
      <span className="absolute bottom-5 end-5 z-20 h-8 w-8 border-b border-e border-stone-950/20 transition-[border-color,opacity] duration-700 group-hover:border-emerald-900/30 group-hover:opacity-80 motion-reduce:transition-none" />
    </div>
  );
}
