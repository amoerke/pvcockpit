/**
 * Ersparnis-Seite: URL-Werte prüfen, Zeitraum und Bucket bestimmen, Zeilen
 * aus savings_by_period() (Migration 0005) zu Balken und Summen verdichten.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import type { Database } from "@/lib/supabase/database.types";
import { addDays, type DayString } from "@/lib/time";

import { countDays, RANGES, rangeDays, type Bucket } from "./period";

/** Eine Ergebniszeile der Postgres-Funktion savings_by_period(). */
export type SavingsPeriodRow =
  Database["public"]["Functions"]["savings_by_period"]["Returns"][number];

/**
 * Zeiträume der Ersparnis-Seite: die aus dem Verlauf plus "Alles".
 * "Alles" hat keinen festen Bucket – er hängt davon ab, wie lange die
 * Anlage schon läuft (bucketFor()).
 */
export const SAVINGS_RANGES = {
  ...RANGES,
  all: { label: "Alles", title: "Seit Beginn", bucket: null },
} as const;

export type SavingsRange = keyof typeof SAVINGS_RANGES;

/** Zeitraum ohne ?range= – ein Monat zeigt mehr als eine Woche. */
export const DEFAULT_SAVINGS_RANGE: SavingsRange = "30d";

/** Prüft ?range=… – wie parseRange(), aber inklusive "all". */
export function parseSavingsRange(value: string | string[] | undefined): SavingsRange {
  return typeof value === "string" && Object.hasOwn(SAVINGS_RANGES, value)
    ? (value as SavingsRange)
    : DEFAULT_SAVINGS_RANGE;
}

/**
 * Bucket nach Länge des Zeitraums: bis ~2 Monate Tage, bis ~3 Jahre Monate,
 * danach Jahre. So bleibt die Zahl der Balken überschaubar (≤ 62 / ≤ 36),
 * und "Alles" zeigt anfangs nicht nur einen einzigen Jahresbalken.
 */
export function bucketFor(from: DayString, to: DayString): Bucket {
  const days = countDays(from, to);
  if (days <= 62) return "day";
  if (days <= 3 * 366) return "month";
  return "year";
}

/**
 * Erster/letzter Tag und Bucket für einen Zeitraum. Für "all" braucht es den
 * ersten Tag aus der Datenbank (`firstDay`, der älteste Tarif).
 */
export function savingsPeriod(
  range: SavingsRange,
  today: DayString,
  firstDay: DayString | null,
): { from: DayString; to: DayString; bucket: Bucket } {
  if (range === "all") {
    // Ohne Tarif gibt es ohnehin keine Ersparnis – dann eben nur heute.
    const from = firstDay && firstDay < today ? firstDay : today;
    return { from, to: today, bucket: bucketFor(from, today) };
  }
  return { ...rangeDays(range, today), bucket: RANGES[range].bucket };
}

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
export function savingsHref(range: SavingsRange, view: SavingsView): string {
  const params = new URLSearchParams();
  if (range !== DEFAULT_SAVINGS_RANGE) params.set("range", range);
  if (view !== "total") params.set("view", view);
  const query = params.toString();
  return query ? `/dashboard/savings?${query}` : "/dashboard/savings";
}

/** Schlüssel eines Tages im Bucket – gleiche Form wie `period` aus SQL. */
export function bucketKey(day: DayString, bucket: Bucket): string {
  if (bucket === "day") return day;
  if (bucket === "month") return day.slice(0, 7);
  return day.slice(0, 4);
}

/** Ein Balken: Euro je Tag, Monat oder Jahr; `null` = keine Werte (Lücke). */
export type SavingsBar = {
  key: string;
  savings: number | null;
  feedIn: number | null;
};

/**
 * Ein Balken je Bucket von `from` bis `to` – auch für Lücken. Die Datenbank
 * hat schon gruppiert; hier werden nur die fehlenden Buckets ergänzt.
 */
export function toSavingsBars(
  rows: SavingsPeriodRow[],
  from: DayString,
  to: DayString,
  bucket: Bucket,
): SavingsBar[] {
  const bars = new Map<string, SavingsBar>();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = bucketKey(day, bucket);
    if (!bars.has(key)) bars.set(key, { key, savings: null, feedIn: null });
  }

  for (const row of rows) {
    const bar = bars.get(row.period);
    if (!bar) continue;
    bar.savings = row.savings_eur;
    bar.feedIn = row.feed_in_eur;
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

/** Summe über alle Buckets mit Tarif – `null`, wenn es keinen gibt. */
export function sumSavings(rows: SavingsPeriodRow[]): SavingsTotals | null {
  const priced = rows.filter(
    (row): row is SavingsPeriodRow & { savings_eur: number; feed_in_eur: number } =>
      row.savings_eur !== null && row.feed_in_eur !== null,
  );
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
