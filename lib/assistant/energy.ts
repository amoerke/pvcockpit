/**
 * Tool-Logik für den Assistenten: Zeitraum prüfen, Tageszeilen aus
 * daily_energy() zu kompakten Antworten fürs Modell verdichten –
 * für get_energy_summary (ein Block) und get_energy_by_period (je Bucket).
 *
 * Bewusst ohne "server-only": reine Logik, testbar. Die Kennzahlen kommen
 * aus sumEnergy() und toRatios() – dieselben Formeln wie im Dashboard.
 */
import { z } from "zod";

import { round } from "@/lib/assistant/round";
import { countDays, sumEnergy, type Bucket, type DailyEnergyRow } from "@/lib/readings/period";
import { toRatios } from "@/lib/readings/ratios";
import { bucketKey } from "@/lib/readings/savings";
import { addDays, type DayString } from "@/lib/time";

/**
 * Ein Kalendertag als Tool-Parameter. z.iso.date() prüft Format UND ob es
 * den Tag gibt (2026-02-30 ist ungültig). Die Beschreibung liest das Modell.
 */
export const DaySchema = z.iso.date().describe("Kalendertag in Europe/Berlin, Format YYYY-MM-DD");

/** Bucket als Tool-Parameter – die Werte, die savings_by_period() kennt. */
export const BucketSchema = z
  .enum(["day", "month", "year"])
  .describe("Gruppierung: day = je Tag, month = je Kalendermonat, year = je Kalenderjahr");

/**
 * Längster erlaubter Zeitraum. daily_energy() liefert eine Zeile je Tag, und
 * PostgREST gibt höchstens 1.000 Zeilen zurück – darüber würden Tage still
 * fehlen. Lieber eine klare Fehlermeldung ans Modell.
 */
const MAX_DAYS = 1000;

/**
 * Höchstens so viele Werte in get_energy_by_period. Jeder Eintrag kostet
 * ~100 Tokens; 1000 Tageswerte wären teuer und fürs Modell unübersichtlich.
 */
const MAX_BUCKETS = 100;

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

/** Wie checkRange(), plus: nicht zu viele Buckets für get_energy_by_period. */
export function checkBuckets(from: DayString, to: DayString, bucket: Bucket): string | null {
  const count = bucketKeys(from, to, bucket).length;
  if (count <= MAX_BUCKETS) return null;
  return `${count} Werte sind zu viele (höchstens ${MAX_BUCKETS}). Gröberen bucket wählen (month oder year) oder den Zeitraum verkürzen.`;
}

/**
 * Energiewerte für eine Menge von Tagen. Einheit steht im Feldnamen, damit
 * das Modell nicht raten muss. `null` = keine Messwerte bzw. nicht berechenbar.
 */
export type EnergyFigures = {
  /** Tage, an denen es überhaupt Messwerte gab. */
  days_with_data: number;
  /** Gemessene Stunden; deutlich unter 24 × Tage = Datenlücke. */
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

/** Antwort von get_energy_summary: der ganze Zeitraum als ein Block. */
export type EnergySummary = {
  from: DayString;
  to: DayString;
  /** Kalendertage im Zeitraum. */
  day_count: number;
} & EnergyFigures;

/** Antwort von get_energy_by_period: ein Eintrag je Tag, Monat oder Jahr. */
export type EnergyByPeriod = {
  from: DayString;
  to: DayString;
  bucket: Bucket;
  /** "2026-10-28" (day), "2026-10" (month) bzw. "2026" (year), chronologisch. */
  periods: ({ period: string } & EnergyFigures)[];
};

/** Verdichtet die Tageszeilen eines Zeitraums zu einer Zusammenfassung. */
export function toEnergySummary(
  rows: DailyEnergyRow[],
  from: DayString,
  to: DayString,
): EnergySummary {
  return { from, to, day_count: countDays(from, to), ...toFigures(rows) };
}

/**
 * Ein Eintrag je Bucket – AUCH für Buckets ohne Messwerte (wie
 * toPeriodBars()). Sonst hielte das Modell einen fehlenden Monat womöglich
 * für einen, den es übersehen hat.
 */
export function toEnergyByPeriod(
  rows: DailyEnergyRow[],
  from: DayString,
  to: DayString,
  bucket: Bucket,
): EnergyByPeriod {
  const groups = new Map<string, DailyEnergyRow[]>(bucketKeys(from, to, bucket).map((key) => [key, []]));
  for (const row of rows) groups.get(bucketKey(row.day, bucket))?.push(row);

  return {
    from,
    to,
    bucket,
    periods: [...groups].map(([period, group]) => ({ period, ...toFigures(group) })),
  };
}

/**
 * Die eigentliche Verdichtung – eine Stelle für Summary und Buckets, damit
 * beide garantiert gleich rechnen und runden.
 */
function toFigures(rows: DailyEnergyRow[]): EnergyFigures {
  const totals = sumEnergy(rows);
  const ratios = toRatios(totals);

  return {
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

/** Alle Bucket-Schlüssel von `from` bis `to`, chronologisch, ohne Doppelte. */
function bucketKeys(from: DayString, to: DayString, bucket: Bucket): string[] {
  const keys = new Set<string>();
  for (let day = from; day <= to; day = addDays(day, 1)) keys.add(bucketKey(day, bucket));
  return [...keys];
}
