import { Link } from "@/i18n/navigation";

export function ProductCardActions({
  productId,
  productSlug,
  productName,
  viewLabel,
  inquiryLabel,
  isRtl,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  viewLabel: string;
  inquiryLabel: string;
  isRtl: boolean;
}) {
  return (
    <div className="mt-auto grid grid-cols-1 gap-2.5 pt-6 sm:grid-cols-[minmax(0,1fr)_auto]">
      <Link
        href={`/products/${productSlug}`}
        aria-label={`${viewLabel}: ${productName}`}
        className="group/detail relative inline-flex min-h-12 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-emerald-700/25 bg-emerald-900/[0.88] px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_32px_-18px_rgba(6,78,59,0.45)] outline-none transition-[background-color,border-color,box-shadow] duration-700 hover:border-emerald-500/35 hover:bg-emerald-800/[0.92] focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-5"
      >
        <span className="min-w-0">{viewLabel}</span>
        <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.10] text-base transition-colors duration-700 group-hover/detail:bg-white/[0.16] motion-reduce:transition-none">{isRtl ? "←" : "→"}</span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-70" />
      </Link>

      <Link
        href={`/inquiry?product=${encodeURIComponent(productId)}`}
        aria-label={`${inquiryLabel}: ${productName}`}
        className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-emerald-900/[0.13] bg-white/55 px-4 text-center text-sm font-semibold text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none backdrop-blur-xl transition-[border-color,background-color,box-shadow] duration-700 hover:border-emerald-900/20 hover:bg-emerald-900/[0.055] focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-5"
      >
        <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
          <span className="absolute size-full animate-ping rounded-full bg-emerald-700 opacity-20 motion-reduce:animate-none" />
          <span className="relative size-1.5 rounded-full bg-emerald-700" />
        </span>
        <span>{inquiryLabel}</span>
      </Link>
    </div>
  );
}
