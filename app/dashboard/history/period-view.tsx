/**
 * Verlauf über einen Zeitraum (7 Tage, 30 Tage, Jahr).
 *
 * Eine async Server Component INNERHALB der Seite: Sie holt ihre Daten
 * selbst. Die Seite entscheidet nur, ob Tag oder Zeitraum gezeigt wird.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPeriodHistory } from "@/lib/data/readings";
import { formatDayRange } from "@/lib/format";
import { RANGES, type Range } from "@/lib/readings/period";

import { SelfSufficiency } from "../self-sufficiency";
import { TodayBalance } from "../today-balance";
import { PeriodChart } from "./period-chart";

export async function PeriodView({ range }: { range: Range }) {
  const history = await getPeriodHistory(range);
  const { title, bucket } = RANGES[range];

  // Wie vollständig ist der Zeitraum? Die sys_*-Werte gibt es erst seit dem
  // 06.10.2026 – die ersten Monate der Jahresansicht sind deshalb noch leer.
  const coverage = history.totals
    ? `Summe über ${history.daysWithData} von ${history.dayCount} Tagen mit Messwerten`
    : "Für diesen Zeitraum liegen keine Messwerte vor.";

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDayRange(history.from, history.to)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Energie je {bucket === "day" ? "Tag" : "Monat"}</CardTitle>
          <CardDescription>
            In der Datenbank aus den Minutenwerten summiert. Fehlende Balken: keine
            Messwerte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.totals ? (
            <PeriodChart bars={history.bars} bucket={bucket} />
          ) : (
            <p className="text-sm text-muted-foreground">{coverage}</p>
          )}
        </CardContent>
      </Card>

      <TodayBalance totals={history.totals} title="Bilanz" description={coverage} />
      <SelfSufficiency totals={history.totals} title="Unabhängigkeit" />
    </>
  );
}
