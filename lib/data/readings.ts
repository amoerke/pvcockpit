/**
 * Datenzugriff auf die Messwerte – Teil des Data Access Layers.
 *
 * Regeln für alle Funktionen in lib/data/:
 * 1. "server-only": läuft nie im Browser.
 * 2. Zuerst verifySession() – die Prüfung liegt direkt neben den Daten,
 *    egal von welcher Seite oder Action die Funktion aufgerufen wird.
 * 3. Rückgabe sind DTOs (nur das Nötige, verständlich benannt) – nie die
 *    rohe Datenbankzeile.
 *
 * Zusätzlich greift in der Datenbank RLS (Migration 0001) – selbst wenn hier
 * etwas vergessen würde, sähe ein nicht eingeloggter Aufrufer nichts.
 */
import "server-only";

import { verifySession } from "@/lib/dal";
import {
  LIVE_COLUMNS,
  minutesSince,
  toLiveReading,
  type LiveReading,
} from "@/lib/readings/live";
import { createClient } from "@/lib/supabase/server";

export type LatestReading = {
  reading: LiveReading;
  /** Alter des Messwerts in Minuten, zum Zeitpunkt der Abfrage. */
  ageMinutes: number;
};

/**
 * Der neueste Messwert samt Alter – oder `null`, falls die Tabelle leer ist.
 */
export async function getLatestReading(): Promise<LatestReading | null> {
  await verifySession();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solar_readings")
    .select(LIVE_COLUMNS)
    // Dank des Index auf `ts` (UNIQUE-Constraint) muss Postgres dafür nicht
    // die ganze Tabelle lesen, sondern springt direkt ans Ende des Index.
    .order("ts", { ascending: false })
    .limit(1)
    // maybeSingle(): ein Objekt statt Array; `null` bei 0 Zeilen (statt
    // eines Fehlers wie bei single()).
    .maybeSingle();

  if (error) {
    // Kein Durchreichen von Details an den Browser – error.tsx zeigt eine
    // allgemeine Meldung, die Details stehen im Server-Log.
    console.error("[getLatestReading]", error.code, error.message);
    throw new Error("Messwerte konnten nicht geladen werden.");
  }

  if (!data) return null;

  // Das Alter wird HIER berechnet, nicht in der Komponente: Date.now() ist
  // "unrein" (jeder Aufruf liefert etwas anderes). React-Komponenten sollen
  // beim Rendern rein sein – der React Compiler bzw. ESLint meldet
  // Date.now() im Render deshalb als Fehler. Eine Datenfunktion darf das.
  return {
    reading: toLiveReading(data),
    ageMinutes: minutesSince(data.ts, Date.now()),
  };
}
