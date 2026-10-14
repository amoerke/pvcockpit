/**
 * Vier Kacheln mit den aktuellen Werten: PV, Batterie, Netz, Haus.
 *
 * Weder "use client" noch "server-only": Die Komponente bekommt ihre Daten
 * als Props und rendert nur. Solche "neutralen" Komponenten funktionieren
 * auf beiden Seiten – hier rendert sie die Client
 * Component LiveDashboard mit Live-Daten (Erst-Render auf dem Server).
 */
import { BatteryMedium, House, Sun, UtilityPole } from "lucide-react";
import type { ReactNode } from "react";

import { Meter } from "@/components/meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent, formatPower } from "@/lib/format";
import type { LiveReading } from "@/lib/readings/live";

export function LiveTiles({ reading }: { reading: LiveReading }) {
  return (
    // Responsive: 1 Spalte auf dem Handy, 2 auf Tablets, 4 auf breiten Bildschirmen.
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile icon={<Sun />} title="PV-Erzeugung" value={formatPower(reading.pvW)} />

      <Tile
        icon={<BatteryMedium />}
        title="Batterie"
        value={formatPercent(reading.socPercent)}
        detail={batteryDetail(reading)}
      >
        <Meter label="Ladezustand" percent={reading.socPercent} />
      </Tile>

      <Tile
        icon={<UtilityPole />}
        title="Netz"
        value={formatPower(gridValue(reading))}
        detail={gridDetail(reading)}
      />

      <Tile icon={<House />} title="Hausverbrauch" value={formatPower(reading.loadW)} />
    </div>
  );
}

function Tile({
  icon,
  title,
  value,
  detail,
  children,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {/* tabular-nums: Ziffern gleich breit → Zahlen "springen" nicht,
            wenn sich Werte ändern (wichtig bei den Live-Updates). */}
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

function batteryDetail(r: LiveReading): string {
  if (r.batteryChargeW) return `lädt mit ${formatPower(r.batteryChargeW)}`;
  if (r.batteryDischargeW) return `entlädt mit ${formatPower(r.batteryDischargeW)}`;
  if (r.batteryChargeW === null) return "keine Leistungsdaten";
  return "Ruhe";
}

/** Die Kachel zeigt den Betrag der gerade aktiven Richtung. */
function gridValue(r: LiveReading): number | null {
  if (r.gridImportW === null) return null;
  return r.gridExportW ? r.gridExportW : r.gridImportW;
}

function gridDetail(r: LiveReading): string {
  if (r.gridExportW) return "Einspeisung";
  if (r.gridImportW) return "Bezug";
  if (r.gridImportW === null) return "keine Leistungsdaten";
  return "kein Austausch";
}
