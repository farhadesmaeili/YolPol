import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";

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
}: {
  specifications: ProductViewModel["specifications"];
  labels: SpecificationLabels;
}) {
  const rows = [
    specifications.capacityMl === undefined
      ? null
      : [labels.capacity, `${specifications.capacityMl} ${labels.milliliters}`],
    specifications.glassColor === undefined
      ? null
      : [labels.glassColor, labels.glassColors[specifications.glassColor]],
    specifications.bottleShape === undefined
      ? null
      : [labels.bottleShape, labels.bottleShapes[specifications.bottleShape]],
    specifications.neckFinish === undefined
      ? null
      : [labels.neckFinish, specifications.neckFinish],
    specifications.weightGrams === undefined
      ? null
      : [labels.weight, `${specifications.weightGrams} ${labels.grams}`],
    specifications.heightMm === undefined
      ? null
      : [labels.height, `${specifications.heightMm} ${labels.millimeters}`],
    specifications.diameterMm === undefined
      ? null
      : [labels.diameter, `${specifications.diameterMm} ${labels.millimeters}`],
  ].filter((row): row is [string, string] => row !== null);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="product-specifications-heading">
      <h2 id="product-specifications-heading" className="text-2xl font-semibold text-stone-950">
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
