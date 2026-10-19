/**
 * Datenzugriff für die Ersparnis-Seite – Teil des Data Access Layers.
 * Gleiche Regeln wie lib/data/readings.ts: "server-only", verifySession()
 * zuerst, Rückgabe als DTO.
 */
import "server-only";

import { verifySession } from "@/lib/dal";
import { countDays, type Bucket } from "@/lib/readings/period";
import {
  savingsPeriod,
  sumSavings,
  toSavingsBars,
  type SavingsBar,
  type SavingsRange,
  type SavingsTotals,
} from "@/lib/readings/savings";
import { createClient } from "@/lib/supabase/server";
import { berlinDay, type DayString } from "@/lib/time";

export type SavingsHistory = {
  range: SavingsRange;
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
 * Ersparnis und Einspeisevergütung für 7 Tage, 30 Tage, ein Jahr oder alles.
 * Die Euro-Beträge rechnet und gruppiert savings_by_period() (Migration 0005)
 * – die App ergänzt nur Lücken und summiert.
 */
export async function getSavingsHistory(range: SavingsRange): Promise<SavingsHistory> {
  await verifySession();

  const supabase = await createClient();
  const today = berlinDay(Date.now());

  // Nur für "Alles": Wo beginnt der Zeitraum? Der älteste Tarif gilt ab der
  // ersten Messung (Migration 0004). Eine Zeile, ein Feld – billig.
  let firstDay: DayString | null = null;
  if (range === "all") {
    const { data, error } = await supabase
      .from("tariffs")
      .select("valid_from")
      .order("valid_from")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[getSavingsHistory] tariffs", error.code, error.message);
      throw new Error("Ersparnis konnte nicht geladen werden.");
    }
    firstDay = data?.valid_from ?? null;
  }

  const { from, to, bucket } = savingsPeriod(range, today, firstDay);

  const { data, error } = await supabase.rpc("savings_by_period", {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });

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
    daysWithData: data.reduce((n, row) => n + row.days_with_data, 0),
    daysWithoutTariff: data.reduce((n, row) => n + row.days_without_tariff, 0),
    dayCount: countDays(from, to),
  };
}
