/**
 * Zeiträume im Verlauf (7 Tage, 30 Tage, Jahr): URL-Wert prüfen, Grenzen
 * berechnen, Tageszeilen aus daily_energy() zu Balken und Summen verdichten.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import type { EnergyTotals } from "@/lib/readings/today";
import type { Database } from "@/lib/supabase/database.types";
import { addDays, type DayString } from "@/lib/time";

/** Eine Ergebniszeile der Postgres-Funktion daily_energy() (Migration 0003). */
export type DailyEnergyRow =
  Database["public"]["Functions"]["daily_energy"]["Returns"][number];

/**
 * Die erlaubten Werte für ?range=… – alles andere zeigt die Tagesansicht.
 * `bucket`: ein Balken je Tag oder je Monat.
 */
export const RANGES = {
  "7d": { label: "7 Tage", title: "Letzte 7 Tage", bucket: "day" },
  "30d": { label: "30 Tage", title: "Letzte 30 Tage", bucket: "day" },
  year: { label: "Jahr", title: "Letzte 12 Monate", bucket: "month" },
} as const;

export type Range = keyof typeof RANGES;
export type Bucket = (typeof RANGES)[Range]["bucket"];

/**
 * Prüft den Wert aus der URL. Wie bei ?date= gilt: Benutzereingabe.
 * Object.hasOwn statt `value in RANGES`: "in" fände auch geerbte Namen
 * wie "toString" und hielte ?range=toString für gültig.
 */
export function parseRange(value: string | string[] | undefined): Range | null {
  return typeof value === "string" && Object.hasOwn(RANGES, value) ? (value as Range) : null;
}

/**
 * Erster und letzter Kalendertag des Zeitraums (beide inklusive).
 * Rollierend bis heute: "7 Tage" = heute und die 6 Tage davor.
 * "Jahr" beginnt am 1. des Monats vor 11 Monaten → genau 12 Monatsbalken.
 */
export function rangeDays(range: Range, today: DayString): { from: DayString; to: DayString } {
  if (range === "year") {
    const [y, m] = today.split("-").map(Number);
    // Date.UTC rechnet Monat −10 o. Ä. selbst in das Vorjahr um.
    const from = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 10);
    return { from, to: today };
  }
  return { from: addDays(today, range === "7d" ? -6 : -29), to: today };
}

/** Ein Balken im Diagramm. kWh; `null` = an diesem Tag/Monat keine Messwerte. */
export type PeriodBar = {
  /** "2026-10-13" (Tag) bzw. "2026-10" (Monat) */
  key: string;
  pv: number | null;
  house: number | null;
  gridImport: number | null;
};

/**
 * Ein Balken je Tag bzw. Monat von `from` bis `to` – AUCH für Tage ohne
 * Zeile aus der Datenbank. Die bekommen `null` und erscheinen als Lücke.
 * Eine 0 würde behaupten, es sei nichts erzeugt worden; tatsächlich wissen
 * wir es nicht (Logger-Ausfall oder vor dem 06.10.2026).
 */
export function toPeriodBars(
  rows: DailyEnergyRow[],
  from: DayString,
  to: DayString,
  bucket: Bucket,
): PeriodBar[] {
  const keyOf = (day: DayString) => (bucket === "day" ? day : day.slice(0, 7));

  // Map behält die Einfügereihenfolge → Balken chronologisch.
  const bars = new Map<string, PeriodBar>();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = keyOf(day);
    if (!bars.has(key)) bars.set(key, { key, pv: null, house: null, gridImport: null });
  }

  for (const row of rows) {
    const bar = bars.get(keyOf(row.day));
    if (!bar) continue; // außerhalb des Zeitraums
    // Erster Tag mit Daten macht aus null eine Zahl, weitere addieren sich.
    bar.pv = (bar.pv ?? 0) + row.pv_kwh;
    bar.house = (bar.house ?? 0) + row.house_kwh;
    bar.gridImport = (bar.gridImport ?? 0) + row.grid_import_kwh;
  }

  return [...bars.values()];
}

/** Summe über alle Tage – dasselbe Format wie die Tagesbilanz. */
export function sumEnergy(rows: DailyEnergyRow[]): EnergyTotals | null {
  if (rows.length === 0) return null;

  const sum = (pick: (row: DailyEnergyRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  return {
    pvKwh: sum((r) => r.pv_kwh),
    loadKwh: sum((r) => r.house_kwh),
    batteryChargeKwh: sum((r) => r.battery_charge_kwh),
    batteryDischargeKwh: sum((r) => r.battery_discharge_kwh),
    gridImportKwh: sum((r) => r.grid_import_kwh),
    gridExportKwh: sum((r) => r.grid_export_kwh),
  };
}

/** Anzahl Kalendertage von `from` bis `to`, beide inklusive. */
export function countDays(from: DayString, to: DayString): number {
  const ms = (day: DayString) => Date.parse(`${day}T00:00:00Z`);
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1;
}
