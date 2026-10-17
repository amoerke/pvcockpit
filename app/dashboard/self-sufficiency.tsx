/**
 * Autarkiegrad und Eigenverbrauchsquote – für heute, einen Tag oder einen
 * Zeitraum (dieselben Formeln, nur andere Summen).
 *
 * Neutrale Komponente (nur Props), wie TodayBalance: wird auf dem Server
 * gerendert und beim Neuladen der Seite neu berechnet.
 */
import { House, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { Meter } from "@/components/meter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEnergy, formatPercent } from "@/lib/format";
import { toRatios } from "@/lib/readings/ratios";
import type { EnergyTotals } from "@/lib/readings/today";

export function SelfSufficiency({
  totals,
  title = "Unabhängigkeit heute",
}: {
  totals: EnergyTotals | null;
  title?: string;
}) {
  const ratios = toRatios(totals);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Berechnet aus der Energiebilanz</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="grid gap-6 sm:grid-cols-2">
          <Ratio
            icon={<House />}
            label="Autarkiegrad"
            percent={ratios.autarkyPercent}
            detail={
              totals && ratios.selfSuppliedKwh !== null
                ? `${formatEnergy(ratios.selfSuppliedKwh)} von ${formatEnergy(totals.loadKwh)} Verbrauch ohne Netz gedeckt`
                : "Noch kein Verbrauch gemessen"
            }
          />
          <Ratio
            icon={<Sun />}
            label="Eigenverbrauchsquote"
            percent={ratios.selfConsumptionPercent}
            detail={
              totals && ratios.selfUsedPvKwh !== null
                ? `${formatEnergy(ratios.selfUsedPvKwh)} von ${formatEnergy(totals.pvKwh)} PV-Strom selbst genutzt`
                : "Noch keine PV-Erzeugung"
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Ratio({
  icon,
  label,
  percent,
  detail,
}: {
  icon: ReactNode;
  label: string;
  percent: number | null;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </dt>
      <dd className="flex flex-col gap-2">
        <span className="text-3xl font-semibold tabular-nums">{formatPercent(percent)}</span>
        <Meter label={label} percent={percent} />
        <span className="text-sm text-muted-foreground">{detail}</span>
      </dd>
    </div>
  );
}
