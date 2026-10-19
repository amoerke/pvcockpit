"use client";

/**
 * Balkendiagramm in Euro je Tag, Monat oder Jahr.
 *
 * - "Gesamt": Ersparnis und Einspeisung GESTAPELT – die Höhe ist die Summe,
 *   die Anteile bleiben sichtbar.
 * - "Ersparnis" / "Einspeisung": nur diese eine Serie. Die y-Achse passt
 *   sich an – die Einspeisung (wenige Cent) wird so überhaupt erst lesbar.
 */
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatEuro, formatEuroTick, formatMonth, formatShortDay } from "@/lib/format";
import type { Bucket } from "@/lib/readings/period";
import type { SavingsBar, SavingsView } from "@/lib/readings/savings";

import { SERIES_COLORS, TooltipRow } from "../history/chart-parts";

const chartConfig = {
  // Ersparnis = selbst verbrauchter Strom → Farbe des Hauses.
  savings: { label: "Ersparnis", theme: SERIES_COLORS.house },
  // Einspeisung = PV-Überschuss → Farbe der PV.
  feedIn: { label: "Einspeisung", theme: SERIES_COLORS.pv },
} satisfies ChartConfig;

type SeriesKey = keyof typeof chartConfig;

const SERIES_BY_VIEW: Record<SavingsView, SeriesKey[]> = {
  total: ["savings", "feedIn"],
  savings: ["savings"],
  feedin: ["feedIn"],
};

export function SavingsChart({
  bars,
  bucket,
  view,
}: {
  bars: SavingsBar[];
  bucket: Bucket;
  view: SavingsView;
}) {
  // Jahresschlüssel ("2026") brauchen keine Formatierung.
  const formatKey = { day: formatShortDay, month: formatMonth, year: (key: string) => key }[
    bucket
  ];
  const series = SERIES_BY_VIEW[view];
  // Höchster Balken der sichtbaren Serien (gestapelt = Summe).
  const max = Math.max(
    0,
    ...bars.map((bar) => series.reduce((sum, key) => sum + (bar[key] ?? 0), 0)),
  );
  const ticks = niceTicks(max);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
      <BarChart data={bars} margin={{ top: 12, left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickFormatter={formatKey} tickLine={false} axisLine={false} />
        <YAxis
          width={72}
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          tickFormatter={formatEuroTick}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const key = payload?.[0]?.payload?.key;
                return typeof key === "string" ? formatKey(key) : null;
              }}
              formatter={(value, name, item) => (
                <TooltipRow
                  color={item.color}
                  label={chartConfig[name as SeriesKey]?.label ?? String(name)}
                  value={formatEuro(typeof value === "number" ? value : null)}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />

        {series.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            // Gleiche stackId → Recharts stapelt die Balken übereinander.
            stackId="eur"
            fill={`var(--color-${key})`}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Achsenstriche mit "runden" Abständen: 1, 2, 2,5 oder 5 × Zehnerpotenz.
 * Recharts wählt bei sehr kleinen Beträgen (Einspeisung: Cent-Bruchteile)
 * auch Schritte wie 0,0045 € – das liest sich schlecht.
 */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= rough) ?? 10 * power;
  const top = Math.ceil(max / step);
  // toPrecision gegen Gleitkomma-Reste wie 0.015000000000000001.
  return Array.from({ length: top + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}
