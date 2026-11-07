/**
 * Datenabfragen für die Tools des Assistenten.
 *
 * Andere Regel als in lib/data/: Statt verifySession() bekommt jede Funktion
 * den Supabase-Client übergeben, den authenticateRequest() schon geprüft hat
 * (Cookie ODER Bearer-Token). verifySession() kennt nur Cookies.
 * Die Sicherheitsgrenze bleibt RLS in der Datenbank – der Client fragt immer
 * als der Nutzer, der den Request geschickt hat.
 *
 * Fehler: Details nur ins Server-Log. Der geworfene Text landet beim Modell
 * (das SDK macht daraus ein Tool-Ergebnis mit isError).
 */
import "server-only";

import type { AuthenticatedClient } from "@/lib/assistant/auth";
import { LIVE_COLUMNS, type LiveRow } from "@/lib/readings/live";
import type { Bucket, DailyEnergyRow } from "@/lib/readings/period";
import type { SavingsPeriodRow } from "@/lib/readings/savings";
import { berlinDay, type DayString } from "@/lib/time";

/** Tageszeilen aus daily_energy(); den Zeitraum prüft vorher checkRange(). */
export async function getDailyEnergy(
  supabase: AuthenticatedClient,
  from: DayString,
  to: DayString,
): Promise<DailyEnergyRow[]> {
  const { data, error } = await supabase.rpc("daily_energy", { p_from: from, p_to: to });
  if (error) fail("getDailyEnergy", error, "Messwerte konnten nicht geladen werden.");
  return data;
}

/** Zeilen aus savings_by_period() (Migration 0005), gruppiert nach `bucket`. */
export async function getSavingsByPeriod(
  supabase: AuthenticatedClient,
  from: DayString,
  to: DayString,
  bucket: Bucket,
): Promise<SavingsPeriodRow[]> {
  const { data, error } = await supabase.rpc("savings_by_period", {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });
  if (error) fail("getSavingsByPeriod", error, "Ersparnis konnte nicht geladen werden.");
  return data;
}

/** Der neueste Messwert – oder `null`, wenn die Tabelle leer ist. */
export async function getLatestRow(supabase: AuthenticatedClient): Promise<LiveRow | null> {
  const { data, error } = await supabase
    .schema("ampere_solar")
    .from("solar_readings")
    .select(LIVE_COLUMNS)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("getLatestRow", error, "Messwerte konnten nicht geladen werden.");
  return data;
}

/**
 * Erster Berliner Kalendertag mit auswertbaren Messwerten – oder `null`.
 *
 * Dieselbe Bedingung wie in daily_energy() (Migration 0003): Erst Zeilen MIT
 * sys_*-Werten zählen (ab 06.10.2026). Die ältesten Zeilen (ab 15.09.) haben
 * sie nicht – mit ihnen hieße „insgesamt“ wochenlang null.
 */
export async function getFirstDataDay(supabase: AuthenticatedClient): Promise<DayString | null> {
  const { data, error } = await supabase
    .schema("ampere_solar")
    .from("solar_readings")
    .select("ts")
    .not("sys_pv_power", "is", null)
    .order("ts")
    .limit(1)
    .maybeSingle();
  if (error) fail("getFirstDataDay", error, "Messwerte konnten nicht geladen werden.");
  return data ? berlinDay(Date.parse(data.ts)) : null;
}

function fail(where: string, error: { code: string; message: string }, message: string): never {
  console.error(`[${where}]`, error.code, error.message);
  throw new Error(message);
}
