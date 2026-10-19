/**
 * Datenzugriff für die Ersparnis-Seite – Teil des Data Access Layers.
 * Gleiche Regeln wie lib/data/readings.ts: "server-only", verifySession()
 * zuerst, Rückgabe als DTO.
 */
import "server-only";

import { verifySession } from "@/lib/dal";
import { countDays, RANGES, rangeDays, type Bucket, type Range } from "@/lib/readings/period";
import {
  countDaysWithoutTariff,
  sumSavings,
  toSavingsBars,
  type SavingsBar,
  type SavingsTotals,
} from "@/lib/readings/savings";
import { createClient } from "@/lib/supabase/server";
import { berlinDay, type DayString } from "@/lib/time";

export type SavingsHistory = {
  range: Range;
  bucket: Bucket;
  from: DayString;
  to: DayString;
  bars: SavingsBar[];
  totals: SavingsTotals | null;
  daysWithData: number;
  daysWithoutTariff: number;
  dayCount: number;
};

/**
 * Ersparnis und Einspeisevergütung für 7 Tage, 30 Tage oder ein Jahr.
 * Die Euro-Beträge rechnet daily_savings() mit dem jeweils gültigen Tarif
 * (Migration 0004) – die App summiert nur noch.
 */
export async function getSavingsHistory(range: Range): Promise<SavingsHistory> {
  await verifySession();

  const { from, to } = rangeDays(range, berlinDay(Date.now()));
  const { bucket } = RANGES[range];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_savings", { p_from: from, p_to: to });

  if (error) {
    console.error("[getSavingsHistory]", error.code, error.message);
    throw new Error("Ersparnis konnte nicht geladen werden.");
  }

  return {
    range,
    bucket,
    from,
    to,
    bars: toSavingsBars(data, from, to, bucket),
    totals: sumSavings(data),
    daysWithData: data.length,
    daysWithoutTariff: countDaysWithoutTariff(data),
    dayCount: countDays(from, to),
  };
}
