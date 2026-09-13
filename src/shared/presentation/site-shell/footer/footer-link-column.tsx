import { Link } from "@/i18n/navigation";
import { FooterSectionHeading } from "@/shared/presentation/site-shell/footer/footer-section-heading";

const footerLinkClass =
  "group relative inline-flex min-h-11 items-center gap-3 text-sm text-stone-600 outline-none transition-colors duration-300 hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb] motion-reduce:transition-none";

export function FooterLinkColumn({ id, index, heading, isRtl, items }: { id: string; index: string; heading: string; isRtl: boolean; items: readonly Readonly<{ href: string; label: string }>[] }) {
  return (
    <nav aria-labelledby={id} className="min-w-0 text-start">
      <FooterSectionHeading id={id} index={index} isRtl={isRtl}>{heading}</FooterSectionHeading>
      <ul className="mt-6 space-y-1">
        {items.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className={footerLinkClass}>
              <span aria-hidden="true" className="h-px w-3 bg-stone-950/20 transition-all duration-300 group-hover:w-6 group-hover:bg-emerald-800 motion-reduce:transition-none" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
