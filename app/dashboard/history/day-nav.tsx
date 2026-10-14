/**
 * Tag zurück / vor / heute – als normale Links.
 *
 * Kein "use client", kein useState: Der gewählte Tag steht in der URL
 * (?date=2026-10-14). Ein Klick ist eine Navigation, die Seite rendert auf
 * dem Server mit dem neuen searchParams-Wert neu. Vorteile: Lesezeichen,
 * Teilen und der Zurück-Knopf des Browsers funktionieren von selbst.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { addDays, type DayString } from "@/lib/time";

/**
 * Links sehen aus wie Buttons, bleiben aber <a>-Elemente.
 * (Button mit render={<Link />} würde role="button" setzen – Screenreader
 * sagten dann "Schaltfläche" an, obwohl der Klick zu einer anderen Seite führt.)
 */
const iconLink = buttonVariants({ variant: "outline", size: "icon" });

export function DayNav({ day, today }: { day: DayString; today: DayString }) {
  const isToday = day === today;

  return (
    <nav aria-label="Tag wählen" className="flex flex-wrap items-center gap-2">
      <Link href={`?date=${addDays(day, -1)}`} className={iconLink}>
        <ChevronLeft />
        <span className="sr-only">Vorheriger Tag</span>
      </Link>

      {/* Die Überschrift der Seite: welcher Tag gerade zu sehen ist. */}
      <h1 className="min-w-56 text-center text-lg font-semibold">{formatDay(day)}</h1>

      {isToday ? (
        // In die Zukunft gibt es nichts zu sehen. Ein deaktivierter Button
        // statt eines Links, damit niemand ins Leere klickt.
        <Button variant="outline" size="icon" disabled>
          <ChevronRight />
          <span className="sr-only">Nächster Tag</span>
        </Button>
      ) : (
        <Link href={`?date=${addDays(day, 1)}`} className={iconLink}>
          <ChevronRight />
          <span className="sr-only">Nächster Tag</span>
        </Link>
      )}

      {!isToday && (
        <Link href="/dashboard/history" className={buttonVariants({ variant: "ghost" })}>
          Heute
        </Link>
      )}
    </nav>
  );
}
