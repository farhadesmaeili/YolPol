import type { ReactNode } from "react";

export const productCatalogHeadingFrameClassName = "mb-10 border-b border-stone-950/[0.10] pb-8 sm:mb-12 sm:pb-9 lg:mb-14";

export function ProductCatalogSurface({ children, isRtl }: { children: ReactNode; isRtl: boolean }) {
  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="relative isolate overflow-hidden bg-[#f3f1eb] text-start text-stone-950">
      {children}
    </div>
  );
}

export function ProductCatalogSection({ children }: { children: ReactNode }) {
  return (
    <section id="catalog" className="relative py-14 sm:py-18 lg:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[15%] size-[min(44rem,90vw)] -translate-x-1/2 rounded-full bg-emerald-800/[0.035] blur-[170px]" />
      </div>
      <div className="mx-auto w-full max-w-[1900px] px-4 sm:px-8 lg:px-14 xl:px-20 2xl:px-24">
        {children}
      </div>
    </section>
  );
}
