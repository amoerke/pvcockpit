/**
 * /dashboard/savings – Ersparnis durch Eigenverbrauch und Einspeisevergütung.
 *
 * Zwei unabhängige Werte in der URL:
 *   ?range=7d|30d|year|all          Zeitraum (ohne → 30 Tage)
 *   ?view=total|savings|feedin      was das Diagramm zeigt (ohne → Gesamt)
 * Beide sind Benutzereingaben und werden geprüft; Unbekanntes fällt auf den
 * Standard zurück.
 */
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { verifySession } from "@/lib/dal";
import { getSavingsHistory } from "@/lib/data/savings";
import { formatDayRange } from "@/lib/format";
import {
  parseSavingsRange,
  parseView,
  SAVINGS_RANGES,
  SAVINGS_VIEWS,
} from "@/lib/readings/savings";

import { SavingsChart } from "./savings-chart";
import { SavingsNav } from "./savings-nav";
import { SavingsSummary } from "./savings-summary";

const BUCKET_LABELS = { day: "Tag", month: "Monat", year: "Jahr" } as const;

export const metadata: Metadata = {
  title: "Ersparnis – AmpereSolar Cockpit",
};

export default async function SavingsPage(props: PageProps<"/dashboard/savings">) {
  await verifySession();

  const { range: rawRange, view: rawView } = await props.searchParams;
  const range = parseSavingsRange(rawRange);
  const view = parseView(rawView);

  const history = await getSavingsHistory(range);
  const { title } = SAVINGS_RANGES[range];
  // Der Bucket kommt aus den Daten: Bei "Alles" hängt er von der Laufzeit ab.
  const { bucket } = history;

  let coverage = history.totals
    ? `Summe über ${history.daysWithData - history.daysWithoutTariff} von ${history.dayCount} Tagen mit Messwerten`
    : "Für diesen Zeitraum liegen keine Messwerte vor.";
  if (history.daysWithoutTariff > 0) {
    coverage += ` · ${history.daysWithoutTariff} Tage ohne hinterlegten Tarif nicht berücksichtigt`;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <SavingsNav range={range} view={view} />

      <div>
        <h1 className="text-lg font-semibold">Ersparnis · {title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDayRange(history.from, history.to)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {SAVINGS_VIEWS[view].label} je {BUCKET_LABELS[bucket]}
          </CardTitle>
          <CardDescription>
            Ersparnis: selbst verbrauchter Strom × Arbeitspreis. Einspeisung:
            eingespeiste kWh × Vergütung. Grundpreis nicht enthalten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.totals ? (
            <SavingsChart bars={history.bars} bucket={bucket} view={view} />
          ) : (
            <p className="text-sm text-muted-foreground">{coverage}</p>
          )}
        </CardContent>
      </Card>

      <SavingsSummary totals={history.totals} description={coverage} />
    </main>
  );
}
