"use client";

/**
 * Leistungskurve eines Tages (Recharts über shadcn Charts).
 *
 * Warum "use client"? Recharts misst die Breite des Containers und reagiert
 * auf die Maus (Tooltip) – beides geht nur im Browser. Die Daten kommen
 * fertig berechnet als Props von der Server Component; hier wird nur gezeichnet.
 */
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatPower, formatTime } from "@/lib/format";
import type { CurvePoint } from "@/lib/readings/day";

/**
 * Bezeichnung und Farbe je Linie. ChartContainer macht daraus
 * CSS-Variablen (--color-pv usw.), getrennt für Hell und Dunkel.
 * Die Theme-Farben (--chart-1 …) sind in unserem Design nur Grautöne –
 * für vier unterscheidbare Linien braucht es echte Farben.
 */
const chartConfig = {
  pv: {
    label: "PV",
    theme: { light: "oklch(0.75 0.16 70)", dark: "oklch(0.82 0.15 80)" },
  },
  house: {
    label: "Haus",
    theme: { light: "oklch(0.5 0.15 255)", dark: "oklch(0.72 0.13 255)" },
  },
  battery: {
    label: "Batterie",
    theme: { light: "oklch(0.58 0.15 150)", dark: "oklch(0.74 0.15 150)" },
  },
  grid: {
    label: "Netz",
    theme: { light: "oklch(0.58 0.2 25)", dark: "oklch(0.7 0.17 25)" },
  },
} satisfies ChartConfig;

type SeriesKey = keyof typeof chartConfig;

const HOUR_MS = 3_600_000;

export function DayChart({
  curve,
  startMs,
  endMs,
}: {
  curve: CurvePoint[];
  startMs: number;
  endMs: number;
}) {
  // Beschriftung alle 3 Stunden: 00:00, 03:00, … (an Tagen der
  // Zeitumstellung um eine Stunde verschoben – dort steht dann z. B. 02:00).
  const ticks: number[] = [];
  for (let t = startMs; t <= endMs; t += 3 * HOUR_MS) ticks.push(t);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
      <ComposedChart data={curve} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          // type="number": Der Abstand der Punkte entspricht der Zeit.
          // Ohne würde Recharts jeden Punkt gleich breit setzen (Kategorie).
          type="number"
          domain={[startMs, endMs]}
          ticks={ticks}
          tickFormatter={(t: number) => formatTime(t)}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          width={64}
          tickFormatter={(w: number) => formatPower(w)}
          tickLine={false}
          axisLine={false}
        />
        {/* Nulllinie: darüber Entladen/Bezug, darunter Laden/Einspeisung. */}
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t;
                return typeof t === "number" ? `${formatTime(t)} Uhr` : null;
              }}
              formatter={(value, name, item) => (
                <TooltipRow
                  color={item.color}
                  label={chartConfig[name as SeriesKey]?.label ?? String(name)}
                  value={formatPower(typeof value === "number" ? value : null)}
                />
              )}
            />
          }
        />
        {/* itemSorter={null}: Reihenfolge wie im Code (PV, Haus, Batterie, Netz).
            Standard wäre alphabetisch nach dataKey ("battery" zuerst). */}
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />

        <Area
          dataKey="pv"
          type="monotone"
          stroke="var(--color-pv)"
          fill="var(--color-pv)"
          fillOpacity={0.25}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {(["house", "battery", "grid"] as const).map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}

function TooltipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}
