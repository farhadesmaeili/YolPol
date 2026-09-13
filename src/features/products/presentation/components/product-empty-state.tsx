import {Link} from "@/i18n/navigation";

export function ProductEmptyState({
  title,
  description,
  backLabel,
}: {
  title: string;
  description: string;
  backLabel: string;
}) {
  return (
    <section className="mt-12 rounded-2xl border border-stone-200 bg-white p-8 sm:p-12">
      <h2 className="text-2xl font-semibold text-stone-950">{title}</h2>
      <p className="mt-3 max-w-2xl leading-7 text-stone-600">{description}</p>
      <Link
        href="/"
        className="mt-7 inline-flex rounded-full bg-emerald-900 px-5 py-3 text-sm font-medium text-white outline-none transition-colors hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
      >
        {backLabel}
      </Link>
    </section>
  );
}
