/**
 * Tool-Logik für get_savings: Zeilen aus savings_by_period() zu einer
 * Antwort fürs Modell verdichten. Die Euro-Beträge rechnet die Datenbank
 * (Migration 0005), summiert wird mit sumSavings() – wie auf der Ersparnis-Seite.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import { round } from "@/lib/assistant/round";
import { countDays } from "@/lib/readings/period";
import { sumSavings, type SavingsPeriodRow } from "@/lib/readings/savings";
import type { DayString } from "@/lib/time";

/** Antwort von get_savings. `null` = für keinen Tag ein Tarif hinterlegt. */
export type SavingsSummary = {
  from: DayString;
  to: DayString;
  day_count: number;
  days_with_data: number;
  /** Tage MIT Messwerten, aber ohne Tarif – deren Euro fehlen in den Summen. */
  days_without_tariff: number;
  /** Gesparte Stromkosten: selbst verbrauchter PV-Strom × Bezugspreis. */
  savings_eur: number | null;
  /** Einspeisevergütung: eingespeister Strom × Vergütungssatz. */
  feed_in_eur: number | null;
  /** savings_eur + feed_in_eur */
  total_eur: number | null;
  self_consumption_kwh: number | null;
  grid_export_kwh: number | null;
};

export function toSavingsSummary(
  rows: SavingsPeriodRow[],
  from: DayString,
  to: DayString,
): SavingsSummary {
  const totals = sumSavings(rows);

  return {
    from,
    to,
    day_count: countDays(from, to),
    days_with_data: rows.reduce((n, row) => n + row.days_with_data, 0),
    days_without_tariff: rows.reduce((n, row) => n + row.days_without_tariff, 0),
    savings_eur: round(totals?.savingsEur, 2),
    feed_in_eur: round(totals?.feedInEur, 2),
    total_eur: round(totals?.totalEur, 2),
    self_consumption_kwh: round(totals?.selfConsumptionKwh, 2),
    grid_export_kwh: round(totals?.gridExportKwh, 2),
  };
}
