/**
 * Ersparnis-Seite: URL-Werte prüfen, Links bauen, Tageszeilen aus
 * daily_savings() (Migration 0004) zu Balken und Summen verdichten.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import type { Database } from "@/lib/supabase/database.types";
import { addDays, type DayString } from "@/lib/time";

import type { Bucket, Range } from "./period";

/** Eine Ergebniszeile der Postgres-Funktion daily_savings(). */
export type DailySavingsRow =
  Database["public"]["Functions"]["daily_savings"]["Returns"][number];

/** Zeitraum ohne ?range= – ein Monat zeigt mehr als eine Woche. */
export const DEFAULT_SAVINGS_RANGE: Range = "30d";

/** Was das Diagramm zeigt – ?view=… */
export const SAVINGS_VIEWS = {
  total: { label: "Gesamt" },
  savings: { label: "Ersparnis" },
  feedin: { label: "Einspeisung" },
} as const;

export type SavingsView = keyof typeof SAVINGS_VIEWS;

/** Prüft ?view=… – gleiches Muster wie parseRange(). Unbekannt → "total". */
export function parseView(value: string | string[] | undefined): SavingsView {
  return typeof value === "string" && Object.hasOwn(SAVINGS_VIEWS, value)
    ? (value as SavingsView)
    : "total";
}

/**
 * Link auf die Ersparnis-Seite mit BEIDEN Werten. Wer den Zeitraum wechselt,
 * behält die Ansicht und umgekehrt – deshalb bekommt jeder Link immer beide.
 * Standardwerte bleiben weg, damit die URL kurz bleibt.
 */
export function savingsHref(range: Range, view: SavingsView): string {
  const params = new URLSearchParams();
  if (range !== DEFAULT_SAVINGS_RANGE) params.set("range", range);
  if (view !== "total") params.set("view", view);
  const query = params.toString();
  return query ? `/dashboard/savings?${query}` : "/dashboard/savings";
}

/** Ein Balken: Euro je Tag bzw. Monat; `null` = keine Messwerte (Lücke). */
export type SavingsBar = {
  key: string;
  savings: number | null;
  feedIn: number | null;
};

/**
 * Hat die Zeile einen Tarif? Ohne Tarif sind die Euro-Spalten null – solche
 * Tage zählen wie Tage ohne Messwerte, statt still 0 € zu ergeben.
 */
function hasTariff(
  row: DailySavingsRow,
): row is DailySavingsRow & { savings_eur: number; feed_in_eur: number } {
  return row.savings_eur !== null && row.feed_in_eur !== null;
}

/** Wie toPeriodBars(): ein Balken je Tag/Monat, auch für Lücken. */
export function toSavingsBars(
  rows: DailySavingsRow[],
  from: DayString,
  to: DayString,
  bucket: Bucket,
): SavingsBar[] {
  const keyOf = (day: DayString) => (bucket === "day" ? day : day.slice(0, 7));

  const bars = new Map<string, SavingsBar>();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = keyOf(day);
    if (!bars.has(key)) bars.set(key, { key, savings: null, feedIn: null });
  }

  for (const row of rows.filter(hasTariff)) {
    const bar = bars.get(keyOf(row.day));
    if (!bar) continue;
    bar.savings = (bar.savings ?? 0) + row.savings_eur;
    bar.feedIn = (bar.feedIn ?? 0) + row.feed_in_eur;
  }

  return [...bars.values()];
}

export type SavingsTotals = {
  savingsEur: number;
  feedInEur: number;
  totalEur: number;
  selfConsumptionKwh: number;
  gridExportKwh: number;
};

/** Summe über alle Tage mit Tarif – `null`, wenn es keinen gibt. */
export function sumSavings(rows: DailySavingsRow[]): SavingsTotals | null {
  const priced = rows.filter(hasTariff);
  if (priced.length === 0) return null;

  const sum = (pick: (row: (typeof priced)[number]) => number) =>
    priced.reduce((total, row) => total + pick(row), 0);

  const savingsEur = sum((r) => r.savings_eur);
  const feedInEur = sum((r) => r.feed_in_eur);

  return {
    savingsEur,
    feedInEur,
    totalEur: savingsEur + feedInEur,
    selfConsumptionKwh: sum((r) => r.self_consumption_kwh),
    gridExportKwh: sum((r) => r.grid_export_kwh),
  };
}

/** Tage mit Messwerten, aber ohne Tarif – sollte 0 sein, sonst Hinweis. */
export function countDaysWithoutTariff(rows: DailySavingsRow[]): number {
  return rows.filter((row) => !hasTariff(row)).length;
}
