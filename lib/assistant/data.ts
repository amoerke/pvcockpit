/**
 * Datenabfragen für die Tools des Assistenten.
 *
 * Andere Regel als in lib/data/: Statt verifySession() bekommt jede Funktion
 * den Supabase-Client übergeben, den authenticateRequest() schon geprüft hat
 * (Cookie ODER Bearer-Token). verifySession() kennt nur Cookies.
 * Die Sicherheitsgrenze bleibt RLS in der Datenbank – der Client fragt immer
 * als der Nutzer, der den Request geschickt hat.
 */
import "server-only";

import type { AuthenticatedClient } from "@/lib/assistant/auth";
import type { DailyEnergyRow } from "@/lib/readings/period";
import type { DayString } from "@/lib/time";

/** Tageszeilen aus daily_energy(); den Zeitraum prüft vorher checkRange(). */
export async function getDailyEnergy(
  supabase: AuthenticatedClient,
  from: DayString,
  to: DayString,
): Promise<DailyEnergyRow[]> {
  const { data, error } = await supabase.rpc("daily_energy", { p_from: from, p_to: to });

  if (error) {
    // Details nur ins Server-Log. Der geworfene Fehler landet beim Modell.
    console.error("[getDailyEnergy]", error.code, error.message);
    throw new Error("Messwerte konnten nicht geladen werden.");
  }

  return data;
}
