import type { ReactNode } from "react";

export function ProductCatalogFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute -start-2 -top-2 h-7 w-7 border-s border-t border-stone-950/25 sm:-start-5 sm:-top-5 sm:h-10 sm:w-10" />
      <span aria-hidden="true" className="pointer-events-none absolute -end-2 -top-2 h-7 w-7 border-e border-t border-stone-950/25 sm:-end-5 sm:-top-5 sm:h-10 sm:w-10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 -start-2 h-7 w-7 border-b border-s border-stone-950/25 sm:-bottom-5 sm:-start-5 sm:h-10 sm:w-10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 -end-2 h-7 w-7 border-b border-e border-stone-950/25 sm:-bottom-5 sm:-end-5 sm:h-10 sm:w-10" />
      {children}
    </div>
  );
}
