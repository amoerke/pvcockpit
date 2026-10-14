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
import { toDayCurve, type CurvePoint } from "@/lib/readings/day";
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
import { berlinDay, dayRangeBerlin, parseDay, type DayString } from "@/lib/time";

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
 * Alle Minutenwerte im Zeitraum [start, end), nach Zeit aufsteigend.
 * Nicht exportiert: Aufrufer gehen über die Funktionen unten, die zuerst
 * verifySession() aufrufen.
 */
async function fetchDayRows(start: string, end: string): Promise<TodayRow[]> {
  const supabase = await createClient();
  const rows: TodayRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("solar_readings")
      .select(TODAY_COLUMNS)
      .gte("ts", start)
      .lt("ts", end)
      // Aufsteigend: Summe und Kurve brauchen die Reihenfolge der Messungen.
      .order("ts", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[fetchDayRows]", error.code, error.message);
      throw new Error("Messwerte konnten nicht geladen werden.");
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Tagesbilanz von heute (Berliner Zeit), aus den Minutenwerten aufsummiert –
 * oder `null`, falls es heute noch keine Zeile gibt (z. B. kurz nach
 * Mitternacht).
 */
export async function getTodayTotals(): Promise<TodayTotals | null> {
  await verifySession();

  const { start, end } = dayRangeBerlin(berlinDay(Date.now()));
  return toTodayTotals(await fetchDayRows(start, end));
}

export type DayHistory = {
  /** Der angezeigte Tag (geprüft). */
  day: DayString;
  /** Heutiger Tag in Berlin – für "Nächster Tag" und den Heute-Link. */
  today: DayString;
  /** Tagesgrenzen in ms – die x-Achse zeigt immer den ganzen Tag. */
  startMs: number;
  endMs: number;
  curve: CurvePoint[];
  totals: TodayTotals | null;
};

/**
 * Verlauf eines Kalendertags: Leistungskurve (5-Minuten-Mittel) und
 * Tagesbilanz. Beides aus DENSELBEN Zeilen – eine Abfrage, zwei Auswertungen.
 *
 * @param requested roher Wert aus der URL (?date=…). Wird hier geprüft:
 *   ungültig, fehlend oder in der Zukunft → heute. Date.now() steht deshalb
 *   hier und nicht in der Seite (Komponenten müssen rein sein, vgl. Schritt 13).
 */
export async function getDayHistory(
  requested: string | string[] | undefined,
): Promise<DayHistory> {
  await verifySession();

  const today = berlinDay(Date.now());
  const day = parseDay(requested, today);

  const { start, end } = dayRangeBerlin(day);
  const rows = await fetchDayRows(start, end);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  return {
    day,
    today,
    startMs,
    endMs,
    curve: toDayCurve(rows, startMs, endMs),
    totals: toTodayTotals(rows),
  };
}
