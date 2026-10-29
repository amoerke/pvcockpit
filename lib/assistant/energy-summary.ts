/**
 * Tool-Logik für den Assistenten: Zeitraum prüfen, Tageszeilen aus
 * daily_energy() zu einer kompakten Antwort fürs Modell verdichten.
 *
 * Bewusst ohne "server-only": reine Logik, testbar. Die Kennzahlen kommen
 * aus sumEnergy() und toRatios() – dieselben Formeln wie im Dashboard.
 */
import { z } from "zod";

import { countDays, sumEnergy, type DailyEnergyRow } from "@/lib/readings/period";
import { toRatios } from "@/lib/readings/ratios";
import type { DayString } from "@/lib/time";

/**
 * Ein Kalendertag als Tool-Parameter. z.iso.date() prüft Format UND ob es
 * den Tag gibt (2026-02-30 ist ungültig). Die Beschreibung liest das Modell.
 */
export const DaySchema = z.iso.date().describe("Kalendertag in Europe/Berlin, Format YYYY-MM-DD");

/** Längster erlaubter Zeitraum – schützt vor versehentlich riesigen Abfragen. */
const MAX_DAYS = 3660;

/**
 * Prüft einen Zeitraum, den das Modell angefragt hat.
 *
 * Anders als parseDay() kein stiller Rückfall auf "heute": Das Modell soll
 * eine klare Fehlermeldung bekommen und den Aufruf korrigieren können.
 * Rückgabe: Fehlertext oder `null`, wenn alles passt.
 *
 * Getrennt vom Schema, weil MCP-Tools ihre Parameter als einzelne Felder
 * beschreiben – Regeln über mehrere Felder (from ≤ to) passen da nicht hinein.
 */
export function checkRange(from: DayString, to: DayString, today: DayString): string | null {
  // Textvergleich funktioniert, weil YYYY-MM-DD von links nach rechts sortiert.
  if (from > to) return `"from" (${from}) liegt nach "to" (${to}).`;
  if (to > today) return `"to" (${to}) liegt in der Zukunft; heute ist ${today}.`;
  if (countDays(from, to) > MAX_DAYS) return `Zeitraum zu lang (höchstens ${MAX_DAYS} Tage).`;
  return null;
}

/**
 * Antwort von get_energy_summary. Einheit steht im Feldnamen, damit das
 * Modell nicht raten muss. `null` = keine Messwerte bzw. nicht berechenbar.
 */
export type EnergySummary = {
  from: DayString;
  to: DayString;
  /** Kalendertage im Zeitraum. */
  day_count: number;
  /** Tage, an denen es überhaupt Messwerte gab. */
  days_with_data: number;
  /** Gemessene Stunden; deutlich unter 24 × day_count = Datenlücke. */
  measured_hours: number;
  pv_kwh: number | null;
  house_kwh: number | null;
  grid_import_kwh: number | null;
  grid_export_kwh: number | null;
  battery_charge_kwh: number | null;
  battery_discharge_kwh: number | null;
  /** Anteil des Hausverbrauchs, der nicht aus dem Netz kam. */
  autarky_percent: number | null;
  /** Anteil der PV-Erzeugung, der im Haus blieb. */
  self_consumption_percent: number | null;
};

/** Verdichtet die Tageszeilen eines Zeitraums zu einer Zusammenfassung. */
export function toEnergySummary(
  rows: DailyEnergyRow[],
  from: DayString,
  to: DayString,
): EnergySummary {
  const totals = sumEnergy(rows);
  const ratios = toRatios(totals);

  return {
    from,
    to,
    day_count: countDays(from, to),
    days_with_data: rows.length,
    measured_hours: round(rows.reduce((sum, row) => sum + row.measured_hours, 0), 1),
    pv_kwh: round(totals?.pvKwh, 2),
    house_kwh: round(totals?.loadKwh, 2),
    grid_import_kwh: round(totals?.gridImportKwh, 2),
    grid_export_kwh: round(totals?.gridExportKwh, 2),
    battery_charge_kwh: round(totals?.batteryChargeKwh, 2),
    battery_discharge_kwh: round(totals?.batteryDischargeKwh, 2),
    autarky_percent: round(ratios.autarkyPercent, 1),
    self_consumption_percent: round(ratios.selfConsumptionPercent, 1),
  };
}

/**
 * Rundet für die Ausgabe. Mehr Nachkommastellen täuschen eine Genauigkeit
 * vor, die die Minutenwerte nicht haben, und kosten nur Tokens.
 */
function round(value: number, digits: number): number;
function round(value: number | null | undefined, digits: number): number | null;
function round(value: number | null | undefined, digits: number): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
