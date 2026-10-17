"use client";

/**
 * Balkendiagramm für 7 Tage, 30 Tage oder ein Jahr: je Tag bzw. Monat
 * PV-Erzeugung, Hausverbrauch und Netzbezug in kWh.
 *
 * Client Component aus demselben Grund wie DayChart: Recharts misst die
 * Breite und reagiert auf die Maus. Die Balken kommen fertig von der Seite.
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
import { formatEnergy, formatEnergyTick, formatMonth, formatShortDay } from "@/lib/format";
import type { Bucket, PeriodBar } from "@/lib/readings/period";

import { SERIES_COLORS, TooltipRow } from "./chart-parts";

const chartConfig = {
  pv: { label: "PV", theme: SERIES_COLORS.pv },
  house: { label: "Haus", theme: SERIES_COLORS.house },
  // Netzbezug in der Farbe des Netzes aus der Tageskurve.
  gridImport: { label: "Netzbezug", theme: SERIES_COLORS.grid },
} satisfies ChartConfig;

type SeriesKey = keyof typeof chartConfig;

export function PeriodChart({ bars, bucket }: { bars: PeriodBar[]; bucket: Bucket }) {
  const formatKey = bucket === "day" ? formatShortDay : formatMonth;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
      <BarChart data={bars} margin={{ top: 12, left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          // Hier KEIN type="number": Jeder Tag/Monat ist eine Kategorie mit
          // gleich breitem Platz. Recharts lässt Beschriftungen aus, wenn
          // sie nicht nebeneinander passen (30 Tage auf dem Handy).
          dataKey="key"
          tickFormatter={formatKey}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          width={72}
          tickFormatter={formatEnergyTick}
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
                  value={formatEnergy(typeof value === "number" ? value : null)}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />

        {/* null-Werte (Tage ohne Messung) zeichnet Recharts nicht → Lücke. */}
        {(["pv", "house", "gridImport"] as const).map((key) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            radius={2}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
