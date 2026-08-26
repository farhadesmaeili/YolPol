"use client";

import {Link, usePathname} from "@/i18n/navigation";

type StaffNavigationItem = Readonly<{href: "/staff" | "/staff/inquiries" | "/staff/team"; label: string}>;

export function StaffNavigation({items, label}: Readonly<{items: readonly StaffNavigationItem[]; label: string}>) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-3 gap-2 lg:grid-cols-1">
        {items.map((item) => {
          const active = item.href === "/staff" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-11 items-center rounded-lg border border-transparent px-3 text-sm font-medium text-stone-300 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-300 aria-[current=page]:border-emerald-400/30 aria-[current=page]:bg-emerald-400/10 aria-[current=page]:text-emerald-100 motion-reduce:transition-none"
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
