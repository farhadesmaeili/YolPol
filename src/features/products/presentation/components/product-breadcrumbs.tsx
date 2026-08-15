import {Link} from "@/i18n/navigation";

export function ProductBreadcrumbs({
  homeLabel,
  productsLabel,
  productLabel,
  navigationLabel,
}: {
  homeLabel: string;
  productsLabel: string;
  productLabel: string;
  navigationLabel: string;
}) {
  return (
    <nav aria-label={navigationLabel}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <li>
          <Link href="/" className="outline-none hover:text-stone-950 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-700">
            {homeLabel}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/products" className="outline-none hover:text-stone-950 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-700">
            {productsLabel}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-stone-950">
          {productLabel}
        </li>
      </ol>
    </nav>
  );
}
