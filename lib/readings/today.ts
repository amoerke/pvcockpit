/**
 * Tagesbilanz: Typ + Umrechnung aus der Datenbankzeile.
 *
 * Die Spalten *_today_kwh sind Zähler des Wechselrichters: Er summiert selbst
 * über den Tag und setzt sie um Mitternacht zurück. Wir müssen also keine
 * 1.440 Minutenwerte aufaddieren – der neueste Stand von heute IST die Bilanz.
 */
import type { Tables } from "@/lib/supabase/database.types";

export const TODAY_COLUMNS =
  "ts, pv_today_kwh, load_today_kwh, bat_charge_today_kwh, bat_discharge_today_kwh, grid_import_today_kwh, grid_export_today_kwh" as const;

export type TodayRow = Pick<
  Tables<"solar_readings">,
  | "ts"
  | "pv_today_kwh"
  | "load_today_kwh"
  | "bat_charge_today_kwh"
  | "bat_discharge_today_kwh"
  | "grid_import_today_kwh"
  | "grid_export_today_kwh"
>;

/** DTO für die Oberfläche. `null` = kein Zählerstand (Anzeige "–"). */
export type TodayTotals = {
  /** Zeitpunkt des Zählerstands als ISO-String (UTC). */
  timestamp: string;
  pvKwh: number | null;
  loadKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
};

export function toTodayTotals(row: TodayRow): TodayTotals {
  return {
    timestamp: row.ts,
    pvKwh: row.pv_today_kwh,
    loadKwh: row.load_today_kwh,
    batteryChargeKwh: row.bat_charge_today_kwh,
    batteryDischargeKwh: row.bat_discharge_today_kwh,
    gridImportKwh: row.grid_import_today_kwh,
    gridExportKwh: row.grid_export_today_kwh,
  };
}
