import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import type {ReactNode} from "react";
import {LtrIsolate, NumberUnit} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

type SpecificationLabels = Readonly<{
  heading: string;
  capacity: string;
  glassColor: string;
  bottleShape: string;
  neckFinish: string;
  weight: string;
  height: string;
  diameter: string;
  milliliters: string;
  grams: string;
  millimeters: string;
  glassColors: Readonly<Record<"olive-green" | "clear", string>>;
  bottleShapes: Readonly<Record<"round" | "square", string>>;
}>;

export function ProductSpecifications({
  specifications,
  labels,
  locale,
}: {
  specifications: ProductViewModel["specifications"];
  labels: SpecificationLabels;
  locale: Locale;
}) {
  const rows: Array<[string, ReactNode] | null> = [
    specifications.capacityMl === undefined
      ? null
      : [labels.capacity, <NumberUnit key="capacity" locale={locale} value={specifications.capacityMl} unit={labels.milliliters} />],
    specifications.glassColor === undefined
      ? null
      : [labels.glassColor, labels.glassColors[specifications.glassColor]],
    specifications.bottleShape === undefined
      ? null
      : [labels.bottleShape, labels.bottleShapes[specifications.bottleShape]],
    specifications.neckFinish === undefined
      ? null
      : [labels.neckFinish, <LtrIsolate key="neck-finish">{specifications.neckFinish}</LtrIsolate>],
    specifications.weightGrams === undefined
      ? null
      : [labels.weight, <NumberUnit key="weight" locale={locale} value={specifications.weightGrams} unit={labels.grams} />],
    specifications.heightMm === undefined
      ? null
      : [labels.height, <NumberUnit key="height" locale={locale} value={specifications.heightMm} unit={labels.millimeters} />],
    specifications.diameterMm === undefined
      ? null
      : [labels.diameter, <NumberUnit key="diameter" locale={locale} value={specifications.diameterMm} unit={labels.millimeters} />],
  ];
  const visibleRows = rows.filter((row): row is [string, ReactNode] => row !== null);

  if (visibleRows.length === 0) return null;

  return (
    <section aria-labelledby="product-specifications-heading">
      <h2 id="product-specifications-heading" className="text-2xl font-semibold text-stone-950">
        {labels.heading}
      </h2>
      <dl className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
        {visibleRows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-4 sm:grid-cols-2 sm:gap-6">
            <dt className="font-medium text-stone-700">{label}</dt>
            <dd className="text-stone-950">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
