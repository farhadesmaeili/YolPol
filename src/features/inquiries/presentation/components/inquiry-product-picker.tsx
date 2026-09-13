"use client";

import Image from "next/image";
import {useState} from "react";
import type {InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";

export function InquiryProductImage({product}: {product: InquiryProductOption}) {
  const [failed, setFailed] = useState(false);
  return <span className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background sm:size-24">
    {product.image && !failed ? <Image src={product.image.source} alt={product.image.alt} fill sizes="96px" onError={() => setFailed(true)} className="object-contain p-2 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" />
      : <svg aria-hidden="true" viewBox="0 0 32 48" className="h-12 text-brand/40" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3h8v11l5 7v23H7V21l5-7zM12 8h8M7 26h18" /></svg>}
  </span>;
}

export function InquiryProductPicker({products, selectedIds, addLabel, removeLabel, onToggle}: {
  products: readonly InquiryProductOption[]; selectedIds: readonly string[]; addLabel: string; removeLabel: string; onToggle: (productId: string) => void;
}) {
  return <div className="grid min-w-0 gap-3 md:grid-cols-2">{products.map((product) => {
    const selected = selectedIds.includes(product.id);
    return <button key={product.id} id={`inquiry-select-${product.id}`} type="button" aria-pressed={selected} aria-label={`${selected ? removeLabel : addLabel}: ${product.name}`} onClick={() => onToggle(product.id)} className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-start outline-none transition duration-200 active:scale-[.99] focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none ${selected ? "border-brand bg-brand/5 shadow-[inset_0_0_0_1px_var(--brand-primary)]" : "border-border bg-surface hover:border-brand/60 hover:shadow-sm"}`}>
      <InquiryProductImage product={product} />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-6">{product.name}</span><span dir="ltr" className="mt-1 block text-start text-[10px] tracking-wide text-muted-foreground"><bdi>{product.sku}</bdi></span>{product.description ? <span className="mt-2 block text-xs leading-5 text-muted-foreground">{product.description}</span> : null}</span>
      <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-lg ${selected ? "border-brand bg-brand text-white" : "border-border text-brand"}`}>{selected ? "✓" : "+"}</span>
    </button>;
  })}</div>;
}
