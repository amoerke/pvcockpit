/**
 * Live-Messwert: Typ + Umrechnung aus der Datenbankzeile.
 *
 * Bewusst OHNE "server-only": Diese Datei enthält nur reine Logik (keine
 * Datenbank, keine Cookies) und wird von zwei Seiten genutzt:
 * - vom Server (lib/data/readings.ts) beim ersten Rendern,
 * - später vom Browser (Realtime, Schritt 14), wenn eine neue Zeile eintrifft.
 * So steht die Bedeutung der Vorzeichen an genau EINER Stelle.
 */
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Die Spalten, die das Live-Dashboard braucht. Als Konstante, damit
 * Abfrage (select) und Typ (Pick) garantiert zusammenpassen.
 * Die großen raw_*-JSON-Felder (~1/2 KB pro Zeile) laden wir bewusst nicht.
 *
 * Primärquelle sind die sys_*-Spalten (Registerblock 0x4200): Sie zeigen
 * dieselben Werte wie die Ampere Home App – PV inklusive SolarMax, und eine
 * Bilanz, die aufgeht. Die übrigen Spalten dienen nur als Rückfall für
 * Zeilen von vor dem 06.10.2026, in denen sys_* noch fehlt.
 */
export const LIVE_COLUMNS =
  "ts, soc, sys_pv_power, sys_battery_power, sys_grid_power, sys_house_power, pv_power, offset14_power, battery_power, grid_power" as const;

export type LiveRow = Pick<
  Tables<"solar_readings">,
  | "ts"
  | "soc"
  | "sys_pv_power"
  | "sys_battery_power"
  | "sys_grid_power"
  | "sys_house_power"
  | "pv_power"
  | "offset14_power"
  | "battery_power"
  | "grid_power"
>;

/**
 * DTO für die Oberfläche. Statt Werten mit Vorzeichen (deren Bedeutung man
 * kennen muss) gibt es eindeutig benannte, immer positive Felder.
 * `null` = kein Messwert vorhanden (wird als "–" angezeigt, nicht als 0).
 */
export type LiveReading = {
  /** Zeitpunkt der Messung als ISO-String (UTC). */
  timestamp: string;
  pvW: number | null;
  loadW: number | null;
  /** Ladezustand der Batterie in Prozent (0–100). */
  socPercent: number | null;
  batteryChargeW: number | null;
  batteryDischargeW: number | null;
  gridImportW: number | null;
  gridExportW: number | null;
};

/**
 * Zerlegt einen Wert mit Vorzeichen in zwei positive Richtungen.
 * Beispiel Netz: +447 → { positive: 447, negative: 0 } (Bezug)
 *                -1200 → { positive: 0, negative: 1200 } (Einspeisung)
 */
function splitBySign(value: number | null) {
  if (value === null) return { positive: null, negative: null };
  return { positive: Math.max(value, 0), negative: Math.max(-value, 0) };
}

/**
 * Leistungswerte einer Zeile, bevorzugt aus den sys_*-Spalten.
 *
 * Rückfall für alte Zeilen (sys_* = null):
 * - PV = Stränge (pv_power) + SolarMax (offset14_power, Register 0x40A3)
 * - Haus = aus der Bilanz PV + Batterie + Netz. Das Register load_power
 *   (0x40A0) wird bewusst NICHT verwendet – es liegt systematisch zu hoch.
 */
function powerValues(row: LiveRow) {
  if (row.sys_pv_power !== null) {
    return {
      pv: row.sys_pv_power,
      battery: row.sys_battery_power,
      grid: row.sys_grid_power,
      house: row.sys_house_power,
    };
  }

  const pv =
    row.pv_power === null ? null : row.pv_power + (row.offset14_power ?? 0);
  const house =
    pv === null || row.battery_power === null || row.grid_power === null
      ? null
      : Math.max(pv + row.battery_power + row.grid_power, 0);

  return { pv, battery: row.battery_power, grid: row.grid_power, house };
}

export function toLiveReading(row: LiveRow): LiveReading {
  // Vorzeichen-Konvention der Anlage (siehe docs/learning/02-dashboard.md):
  //   Batterie: positiv = entlädt (liefert ans Haus), negativ = lädt
  //   Netz:     positiv = Bezug aus dem Netz,          negativ = Einspeisung
  const values = powerValues(row);
  const battery = splitBySign(values.battery);
  const grid = splitBySign(values.grid);

  return {
    timestamp: row.ts,
    // Nachts liefern die Wechselrichter wenige Watt Standby-Verbrauch als
    // negative PV-Leistung – als Erzeugung ist das 0.
    pvW: values.pv === null ? null : Math.max(values.pv, 0),
    loadW: values.house,
    socPercent: row.soc,
    batteryDischargeW: battery.positive,
    batteryChargeW: battery.negative,
    gridImportW: grid.positive,
    gridExportW: grid.negative,
  };
}

/**
 * Alter eines Messwerts in Minuten.
 * `now` ist ein Parameter (statt fest Date.now() im Inneren), damit die
 * Funktion testbar bleibt und der Aufrufer bestimmt, welche "Jetzt"-Zeit gilt.
 */
export function minutesSince(isoTimestamp: string, now: number): number {
  return (now - new Date(isoTimestamp).getTime()) / 60_000;
}
