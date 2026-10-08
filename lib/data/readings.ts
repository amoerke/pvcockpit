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
  toLiveReading,
  type LiveReading,
} from "@/lib/readings/live";
import {
  TODAY_COLUMNS,
  toTodayTotals,
  type TodayRow,
  type TodayTotals,
} from "@/lib/readings/today";
import { createClient } from "@/lib/supabase/server";
import { startOfDayBerlin } from "@/lib/time";

export type LatestReading = {
  reading: LiveReading;
  /** Zeitpunkt der Abfrage (ms seit 1970). Das Alter rechnet der Client. */
  fetchedAt: number;
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

  // Die Uhrzeit wird HIER gelesen, nicht in der Komponente: Date.now() ist
  // "unrein" (jeder Aufruf liefert etwas anderes). React-Komponenten sollen
  // beim Rendern rein sein – der React Compiler bzw. ESLint meldet
  // Date.now() im Render deshalb als Fehler. Eine Datenfunktion darf das.
  return {
    reading: toLiveReading(data),
    fetchedAt: Date.now(),
  };
}

/**
 * PostgREST liefert pro Anfrage höchstens 1.000 Zeilen (Supabase-Standard
 * "max_rows"). Ein Tag hat bei 1 Messung/Minute bis zu 1.440 Zeilen –
 * deshalb holen wir seitenweise.
 */
const PAGE_SIZE = 1000;

/**
 * Tagesbilanz von heute (Berliner Zeit), aus den Minutenwerten aufsummiert –
 * oder `null`, falls es heute noch keine Zeile gibt (z. B. kurz nach
 * Mitternacht).
 */
export async function getTodayTotals(): Promise<TodayTotals | null> {
  await verifySession();

  const supabase = await createClient();
  // Nur Zeilen ab 00:00 Uhr Berliner Zeit.
  const since = startOfDayBerlin(Date.now());
  const rows: TodayRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("solar_readings")
      .select(TODAY_COLUMNS)
      .gte("ts", since)
      // Aufsteigend: Die Summe braucht die Reihenfolge der Messungen.
      .order("ts", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[getTodayTotals]", error.code, error.message);
      throw new Error("Tagesbilanz konnte nicht geladen werden.");
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return toTodayTotals(rows);
}
