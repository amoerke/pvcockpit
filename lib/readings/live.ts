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
 */
export const LIVE_COLUMNS =
  "ts, pv_power, battery_power, grid_power, load_power, soc" as const;

export type LiveRow = Pick<
  Tables<"solar_readings">,
  "ts" | "pv_power" | "battery_power" | "grid_power" | "load_power" | "soc"
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

export function toLiveReading(row: LiveRow): LiveReading {
  // Vorzeichen-Konvention der Anlage (siehe docs/learning/02-dashboard.md):
  //   battery_power: positiv = entlädt (liefert ans Haus), negativ = lädt
  //   grid_power:    positiv = Bezug aus dem Netz,          negativ = Einspeisung
  const battery = splitBySign(row.battery_power);
  const grid = splitBySign(row.grid_power);

  return {
    timestamp: row.ts,
    pvW: row.pv_power,
    loadW: row.load_power,
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
