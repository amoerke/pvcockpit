/**
 * Energiebilanz: sechs Energiewerte in kWh – für heute, einen Tag im
 * Verlauf oder einen ganzen Zeitraum (7 Tage, 30 Tage, Jahr).
 *
 * Neutrale Komponente (nur Props). Sie wird nur auf dem Server gerendert
 * und aktualisiert sich NICHT live – beim Neuladen der Seite wird neu
 * aufsummiert.
 */
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BatteryCharging,
  BatteryMedium,
  House,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEnergy, formatTime } from "@/lib/format";
import type { EnergyTotals, TodayTotals } from "@/lib/readings/today";

export function TodayBalance({
  totals,
  title = "Heute",
  description,
}: {
  totals: TodayTotals | EnergyTotals | null;
  /** Überschrift – im Verlauf steht hier "Tagesbilanz" statt "Heute". */
  title?: string;
  /** Ersetzt die Standard-Unterzeile (z. B. "Summe über 6 von 7 Tagen"). */
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? defaultDescription(totals)}
        </CardDescription>
      </CardHeader>

      {totals && (
        <CardContent>
          {/* <dl>: Begriff (dt) + Wert (dd) – semantisch passend für
              Kennzahlen, Screenreader lesen die Paare zusammen vor. */}
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Entry icon={<Sun />} label="PV-Erzeugung" kwh={totals.pvKwh} />
            <Entry icon={<House />} label="Hausverbrauch" kwh={totals.loadKwh} />
            <Entry
              icon={<BatteryCharging />}
              label="Batterie geladen"
              kwh={totals.batteryChargeKwh}
            />
            <Entry
              icon={<BatteryMedium />}
              label="Batterie entladen"
              kwh={totals.batteryDischargeKwh}
            />
            <Entry
              icon={<ArrowDownToLine />}
              label="Netzbezug"
              kwh={totals.gridImportKwh}
            />
            <Entry
              icon={<ArrowUpFromLine />}
              label="Einspeisung"
              kwh={totals.gridExportKwh}
            />
          </dl>
        </CardContent>
      )}
    </Card>
  );
}

function defaultDescription(totals: TodayTotals | EnergyTotals | null): string {
  if (!totals) return "Für diesen Tag liegen keine Messwerte vor.";
  // "in" grenzt den Typ ein: Nur Tagessummen haben einen Zeitstempel.
  if ("timestamp" in totals) {
    return `Aus den Minutenwerten berechnet, Stand ${formatTime(totals.timestamp)} Uhr`;
  }
  return "Aus den Minutenwerten berechnet";
}

function Entry({
  icon,
  label,
  kwh,
}: {
  icon: ReactNode;
  label: string;
  kwh: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums">{formatEnergy(kwh)}</dd>
    </div>
  );
}
