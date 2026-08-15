import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";

export type ProductPackagingLabels = Readonly<{
  heading: string;
  unitsPerPackage: string;
  packagesPerPallet: string;
  unitsPerPallet: string;
  palletGrossWeight: string;
  kilograms: string;
}>;

export function ProductPackaging({
  packaging,
  labels,
}: {
  packaging: NonNullable<ProductViewModel["packaging"]>;
  labels: ProductPackagingLabels;
}) {
  const rows = [
    [labels.unitsPerPackage, String(packaging.unitsPerPackage)],
    [labels.packagesPerPallet, String(packaging.packagesPerPallet)],
    [labels.unitsPerPallet, String(packaging.unitsPerPallet)],
    [
      labels.palletGrossWeight,
      `${packaging.palletGrossWeightKg} ${labels.kilograms}`,
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
