/**
 * Zwei Umschalter: Zeitraum (7 Tage | 30 Tage | Jahr) und Ansicht
 * (Gesamt | Ersparnis | Einspeisung).
 *
 * Beide Werte stehen in der URL. Jeder Link trägt BEIDE: Der Zeitraum-Link
 * übernimmt die aktuelle Ansicht, der Ansicht-Link den aktuellen Zeitraum.
 * Sonst würde ein Klick den jeweils anderen Wert auf den Standard zurücksetzen.
 */
import Link from "next/link";

import { RANGES, type Range } from "@/lib/readings/period";
import { SAVINGS_VIEWS, savingsHref, type SavingsView } from "@/lib/readings/savings";
import { cn } from "@/lib/utils";

export function SavingsNav({ range, view }: { range: Range; view: SavingsView }) {
  const ranges = (Object.keys(RANGES) as Range[]).map((r) => ({
    href: savingsHref(r, view),
    label: RANGES[r].label,
    active: r === range,
  }));

  const views = (Object.keys(SAVINGS_VIEWS) as SavingsView[]).map((v) => ({
    href: savingsHref(range, v),
    label: SAVINGS_VIEWS[v].label,
    active: v === view,
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Zeitraum wählen" items={ranges} />
      <Segmented label="Ansicht wählen" items={views} />
    </div>
  );
}

/** Segment-Leiste aus Links – gleiche Optik wie RangeNav im Verlauf. */
function Segmented({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
      {items.map(({ href, label, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
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
