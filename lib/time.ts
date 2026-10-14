/**
 * Zeit-Hilfen für die Ortszeit der Anlage (Europe/Berlin).
 *
 * Bewusst ohne "server-only" und ohne Date.now() im Inneren: reine Funktionen,
 * die "jetzt" als Parameter bekommen – testbar und auf Server wie Client nutzbar.
 */

export const TIME_ZONE = "Europe/Berlin";

// ---------------------------------------------------------------------------
// Kalendertage als Text "YYYY-MM-DD" (für die URL: ?date=2026-10-14)
// ---------------------------------------------------------------------------

/** Kalendertag in Berlin, z. B. "2026-10-14". */
export type DayString = string;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Berliner Kalendertag, in dem `now` liegt.
 * Locale "sv-SE" formatiert Daten als "2026-10-14" – genau unser Format.
 */
export function berlinDay(now: number): DayString {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(new Date(now));
}

/**
 * Prüft einen Wert aus der URL. Ungültig, fehlend oder in der Zukunft → `today`.
 * Werte aus der URL sind Benutzereingaben: Jeder kann ?date=quatsch eintippen.
 */
export function parseDay(value: string | string[] | undefined, today: DayString): DayString {
  if (typeof value !== "string") return today;
  const match = DAY_PATTERN.exec(value);
  if (!match) return today;

  // Gibt es den Tag wirklich? new Date(Date.UTC(2026, 1, 30)) wäre still der 2. März.
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return today;

  // Textvergleich funktioniert, weil das Format von links nach rechts sortiert.
  return value > today ? today : value;
}

/** "2026-10-14" + 1 → "2026-10-15" (Monats- und Jahreswechsel inklusive). */
export function addDays(day: DayString, days: number): DayString {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Beginn und Ende eines Berliner Kalendertags als UTC-ISO-Strings,
 * für `.gte("ts", start).lt("ts", end)`.
 *
 * Stimmt auch an den Tagen der Zeitumstellung: Der 25.10.2026 hat
 * 25 Stunden, der 29.03.2026 nur 23.
 */
export function dayRangeBerlin(day: DayString): { start: string; end: string } {
  return {
    start: new Date(berlinMidnight(day)).toISOString(),
    end: new Date(berlinMidnight(addDays(day, 1))).toISOString(),
  };
}

/** Mitternacht eines Berliner Tags in ms seit 1970. */
function berlinMidnight(day: DayString): number {
  const [y, m, d] = day.split("-").map(Number);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  // Zweimal schätzen: Der Abstand zu UTC hängt vom Zeitpunkt selbst ab.
  // 1. Schätzung mit dem Abstand um 00:00 UTC, 2. mit dem Abstand am Ergebnis.
  const guess = midnightAsUtc - offsetMs(midnightAsUtc);
  return midnightAsUtc - offsetMs(guess);
}

/** Abstand Berlin ↔ UTC zum Zeitpunkt `at`, in ms (Sommer +2 h, Winter +1 h). */
function offsetMs(at: number): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(at))
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const match = /([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}
