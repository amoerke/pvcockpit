/**
 * Zeitraum wählen: Tag | 7 Tage | 30 Tage | Jahr.
 *
 * Wie DayNav nur Links: Der Zeitraum steht in der URL (?range=7d), die
 * Server Component rendert damit neu. Den aktiven Eintrag kennt die Seite
 * aus searchParams – deshalb reicht hier eine Prop, kein usePathname() o. Ä.
 */
import Link from "next/link";

import { RANGES, type Range } from "@/lib/readings/period";
import { cn } from "@/lib/utils";

const ITEMS: { range: Range | null; href: string; label: string }[] = [
  { range: null, href: "/dashboard/history", label: "Tag" },
  ...(Object.keys(RANGES) as Range[]).map((range) => ({
    range,
    href: `/dashboard/history?range=${range}`,
    label: RANGES[range].label,
  })),
];

export function RangeNav({ active }: { active: Range | null }) {
  return (
    <nav
      aria-label="Zeitraum wählen"
      className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
    >
      {ITEMS.map(({ range, href, label }) => (
        <Link
          key={href}
          href={href}
          // Gleiches Muster wie DashboardNav: aria-current = Screenreader-
          // Ansage "aktuelle Seite" und zugleich Styling-Haken.
          aria-current={range === active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            "aria-[current=page]:bg-background aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
