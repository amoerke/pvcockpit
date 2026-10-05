/**
 * Energiefluss-Schema: Woher kommt der Strom, wohin geht er?
 *
 *              PV
 *              ↓
 *   Netz  ⇄  Haus  ⇄  Batterie
 *
 * Bewusst schlicht mit CSS-Grid statt SVG. Pfeile zeigen die aktuelle
 * Richtung; Verbindungen ohne Fluss werden ausgegraut.
 *
 * Wie live-tiles.tsx eine "neutrale" Komponente (nur Props, keine Hooks).
 */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BatteryMedium,
  House,
  Minus,
  Sun,
  UtilityPole,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPower } from "@/lib/format";
import type { LiveReading } from "@/lib/readings/live";
import { cn } from "@/lib/utils";

export function EnergyFlow({ reading }: { reading: LiveReading }) {
  const pvW = reading.pvW ?? 0;
  // Netz: Bezug fließt zum Haus (→), Einspeisung vom Haus weg (←).
  const gridToHouse = (reading.gridImportW ?? 0) > 0;
  const gridW = gridToHouse ? reading.gridImportW : reading.gridExportW;
  // Batterie (rechts vom Haus): Entladen fließt zum Haus (←), Laden weg (→).
  const batteryToHouse = (reading.batteryDischargeW ?? 0) > 0;
  const batteryW = batteryToHouse ? reading.batteryDischargeW : reading.batteryChargeW;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Energiefluss</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 5 gleich breite Spalten × 3 Zeilen. Jedes Element bekommt eine
            FESTE Position (col-start/row-start). Ohne Zeilenangabe würde
            CSS-Grid Elemente automatisch in die nächste freie Zelle schieben
            ("auto-placement") – das Schema geriete durcheinander. */}
        <div className="mx-auto grid max-w-lg grid-cols-5 grid-rows-[auto_auto_auto] items-center gap-y-2 text-center">
          {/* Zeile 1: PV über dem Haus */}
          <div className="col-start-3 row-start-1">
            <Node icon={Sun} label="PV" />
          </div>

          {/* Zeile 2: Pfeil PV → Haus */}
          <div className="col-start-3 row-start-2">
            <Flow watts={pvW} Icon={pvW > 0 ? ArrowDown : Minus} vertical />
          </div>

          {/* Zeile 3: Netz ⇄ Haus ⇄ Batterie */}
          <div className="col-start-1 row-start-3">
            <Node icon={UtilityPole} label="Netz" />
          </div>
          <div className="col-start-2 row-start-3">
            <Flow
              watts={gridW ?? 0}
              Icon={!gridW ? Minus : gridToHouse ? ArrowRight : ArrowLeft}
            />
          </div>
          <div className="col-start-3 row-start-3">
            <Node icon={House} label="Haus" value={formatPower(reading.loadW)} highlight />
          </div>
          <div className="col-start-4 row-start-3">
            <Flow
              watts={batteryW ?? 0}
              Icon={!batteryW ? Minus : batteryToHouse ? ArrowLeft : ArrowRight}
            />
          </div>
          <div className="col-start-5 row-start-3">
            <Node icon={BatteryMedium} label="Batterie" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Node({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full border bg-card",
          highlight && "border-primary",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
      {value && <span className="text-sm font-medium tabular-nums">{value}</span>}
    </div>
  );
}

/** Eine Verbindung: Pfeil + Leistung. Ohne Fluss ausgegraut. */
function Flow({
  watts,
  Icon,
  vertical = false,
}: {
  watts: number;
  Icon: LucideIcon;
  vertical?: boolean;
}) {
  const active = watts > 0;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 px-2 text-xs tabular-nums",
        vertical ? "flex-row" : "flex-col",
        active ? "text-foreground" : "text-muted-foreground/50",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {/* Bei 0 W keinen Text – der ausgegraute Strich sagt genug. */}
      {active && <span className="whitespace-nowrap">{formatPower(watts)}</span>}
    </div>
  );
}
