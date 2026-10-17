/**
 * Tagesbilanz: Typ + Berechnung aus den Minutenwerten von heute.
 *
 * Warum nicht die Zähler *_today_kwh des Wechselrichters?
 * Abgleich mit der Ampere Home App am 08.10.2026: Die SAJ-Tageszähler passen
 * nicht zu den Werten der Anlage. PV zählt ohne SolarMax (4,3 statt 5,5 kWh),
 * Netzbezug/Einspeisung/Hausverbrauch weichen stark ab, und die Bilanz geht
 * um über 8 kWh nicht auf. Die Livewerte aus Block 0x4200 (sys_*-Spalten)
 * stimmen dagegen nachweislich mit der App überein.
 *
 * Deshalb summieren wir die Leistung selbst über den Tag auf:
 *   Energie [Wh] = Σ Leistung [W] × Dauer bis zur nächsten Messung [h]
 * Bei 1 Messung pro Minute ist das auf wenige Prozent genau.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import type { Tables } from "@/lib/supabase/database.types";

export const TODAY_COLUMNS =
  "ts, sys_pv_power, sys_battery_power, sys_grid_power, sys_house_power" as const;

export type TodayRow = Pick<
  Tables<"solar_readings">,
  | "ts"
  | "sys_pv_power"
  | "sys_battery_power"
  | "sys_grid_power"
  | "sys_house_power"
>;

/**
 * Energiesummen eines beliebigen Zeitraums (Tag, 7 Tage, Jahr).
 * `null` = keine Messwerte (Anzeige "–").
 */
export type EnergyTotals = {
  pvKwh: number | null;
  loadKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
};

/** Summen eines Tages aus den Minutenwerten – plus Stand der letzten Messung. */
export type TodayTotals = EnergyTotals & {
  /** Zeitpunkt der letzten berücksichtigten Messung als ISO-String (UTC). */
  timestamp: string;
};

/**
 * Längster Abstand zwischen zwei Messungen, der noch aufsummiert wird.
 * Fällt der Logger länger aus, wissen wir nicht, was in der Lücke passiert
 * ist – dann zählen wir sie lieber gar nicht als mit einem alten Wert.
 */
const MAX_GAP_MS = 5 * 60_000;

const MS_PER_HOUR = 3_600_000;

/**
 * Summiert die Minutenwerte zu Tagesenergien.
 * `rows` muss nach `ts` aufsteigend sortiert sein.
 * Jeder Messwert gilt bis zur nächsten Messung (Rechteckregel); die letzte
 * Zeile hat noch keinen Nachfolger und zählt deshalb erst beim nächsten Laden.
 */
export function toTodayTotals(rows: TodayRow[]): TodayTotals | null {
  if (rows.length === 0) return null;

  let pv = 0;
  let load = 0;
  let charge = 0;
  let discharge = 0;
  let gridImport = 0;
  let gridExport = 0;
  let counted = 0;

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i];
    const dtMs = Date.parse(rows[i + 1].ts) - Date.parse(row.ts);
    if (!(dtMs > 0 && dtMs <= MAX_GAP_MS)) continue;

    // Zeilen von vor dem 06.10.2026 haben noch keine sys_*-Werte.
    const { sys_pv_power, sys_battery_power, sys_grid_power, sys_house_power } = row;
    if (
      sys_pv_power === null ||
      sys_battery_power === null ||
      sys_grid_power === null ||
      sys_house_power === null
    ) {
      continue;
    }

    const h = dtMs / MS_PER_HOUR;
    pv += Math.max(sys_pv_power, 0) * h;
    load += Math.max(sys_house_power, 0) * h;
    // Batterie: positiv = entladen, negativ = laden
    discharge += Math.max(sys_battery_power, 0) * h;
    charge += Math.max(-sys_battery_power, 0) * h;
    // Netz: positiv = Bezug, negativ = Einspeisung
    gridImport += Math.max(sys_grid_power, 0) * h;
    gridExport += Math.max(-sys_grid_power, 0) * h;
    counted++;
  }

  const kwh = (wh: number) => (counted > 0 ? wh / 1000 : null);

  return {
    timestamp: rows[rows.length - 1].ts,
    pvKwh: kwh(pv),
    loadKwh: kwh(load),
    batteryChargeKwh: kwh(charge),
    batteryDischargeKwh: kwh(discharge),
    gridImportKwh: kwh(gridImport),
    gridExportKwh: kwh(gridExport),
  };
}
