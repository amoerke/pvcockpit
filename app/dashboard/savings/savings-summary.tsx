/**
 * Kennzahlen: Gesamt, Ersparnis, Einspeisevergütung – jeweils in Euro,
 * darunter die kWh, aus denen der Betrag entsteht.
 *
 * Neutrale Server Component (nur Props), Aufbau wie TodayBalance.
 */
import { ArrowUpFromLine, House, PiggyBank } from "lucide-react";
import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEnergy, formatEuro } from "@/lib/format";
import type { SavingsTotals } from "@/lib/readings/savings";

export function SavingsSummary({
  totals,
  description,
}: {
  totals: SavingsTotals | null;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summe</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      {totals && (
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Entry icon={<PiggyBank />} label="Gesamt" eur={totals.totalEur} />
            <Entry
              icon={<House />}
              label="Ersparnis"
              eur={totals.savingsEur}
              detail={`${formatEnergy(totals.selfConsumptionKwh)} selbst verbraucht`}
            />
            <Entry
              icon={<ArrowUpFromLine />}
              label="Einspeisevergütung"
              eur={totals.feedInEur}
              detail={`${formatEnergy(totals.gridExportKwh)} eingespeist`}
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
  eur,
  detail,
}: {
  icon: ReactNode;
  label: string;
  eur: number;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums">{formatEuro(eur)}</dd>
      {detail && <dd className="text-sm text-muted-foreground tabular-nums">{detail}</dd>}
    </div>
  );
}
