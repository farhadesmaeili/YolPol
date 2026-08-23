import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {formatHumanNumber, NumberUnit} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

export type ProductPackagingLabels = Readonly<{
  heading: string;
  unitsPerPackage: string;
  packagesPerPallet: string;
  unitsPerPallet: string;
  unitsPerTruck: string;
  palletGrossWeight: string;
  kilograms: string;
}>;

export function ProductPackaging({
  packaging,
  labels,
  locale,
}: {
  packaging: NonNullable<ProductViewModel["packaging"]>;
  labels: ProductPackagingLabels;
  locale: Locale;
}) {
  const rows = [
    [labels.unitsPerPackage, formatHumanNumber(locale, packaging.unitsPerPackage)],
    [labels.packagesPerPallet, formatHumanNumber(locale, packaging.packagesPerPallet)],
    [labels.unitsPerPallet, formatHumanNumber(locale, packaging.unitsPerPallet)],
    [labels.unitsPerTruck, formatHumanNumber(locale, packaging.unitsPerTruck)],
    [
      labels.palletGrossWeight,
      <NumberUnit key="weight" locale={locale} value={packaging.palletGrossWeightKg} unit={labels.kilograms} />,
    ],
  ] as const;

  return (
    <section aria-labelledby="product-packaging-heading">
      <h2 id="product-packaging-heading" className="text-2xl font-semibold text-stone-950">
        {labels.heading}
      </h2>
      <dl className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-4 sm:grid-cols-2 sm:gap-6">
            <dt className="font-medium text-stone-700">{label}</dt>
            <dd className="text-stone-950">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
