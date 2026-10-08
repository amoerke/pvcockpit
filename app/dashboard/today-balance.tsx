/**
 * Tagesbilanz "Heute": sechs Energiewerte in kWh.
 *
 * Neutrale Komponente (nur Props). Sie wird vorerst nur auf dem Server
 * gerendert und aktualisiert sich NICHT live – beim Neuladen der Seite
 * kommt der aktuelle Zählerstand.
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
import type { TodayTotals } from "@/lib/readings/today";

export function TodayBalance({ totals }: { totals: TodayTotals | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Heute</CardTitle>
        <CardDescription>
          {totals
            ? `Zählerstände des Wechselrichters, Stand ${formatTime(totals.timestamp)} Uhr`
            : "Für heute liegen noch keine Zählerstände vor."}
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
