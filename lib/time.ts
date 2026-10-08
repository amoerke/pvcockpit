/**
 * Zeit-Hilfen für die Ortszeit der Anlage (Europe/Berlin).
 *
 * Bewusst ohne "server-only" und ohne Date.now() im Inneren: reine Funktionen,
 * die "jetzt" als Parameter bekommen – testbar und auf Server wie Client nutzbar.
 */

export const TIME_ZONE = "Europe/Berlin";

/**
 * Beginn des Kalendertags (00:00 Uhr Berliner Zeit), in dem `now` liegt –
 * als ISO-String in UTC, direkt nutzbar für `.gte("ts", …)`.
 *
 * Beispiele:
 *   Sommerzeit: now = 2026-10-08T14:00:00Z → "2026-10-07T22:00:00.000Z"
 *   Winterzeit: now = 2026-12-01T09:30:00Z → "2026-11-30T23:00:00.000Z"
 *   Kurz nach Mitternacht: now = 2026-10-07T22:30:00Z (= 00:30 Uhr am 08.10.)
 *                                           → "2026-10-07T22:00:00.000Z"
 *
 * @param now Zeitpunkt in ms seit 1970 (z. B. Date.now())
 */
export function startOfDayBerlin(now: number): string {
  // Ein Formatter liefert beides: Kalendertag in Berlin UND den Abstand zu UTC
  // ("GMT+02:00") – beides für denselben Zeitpunkt `now`.
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  // 1. Mitternacht des Berliner Kalendertags – zunächst als wäre es UTC.
  const midnightAsUtc = Date.UTC(
    Number(part("year")),
    Number(part("month")) - 1, // Date.UTC zählt Monate ab 0
    Number(part("day")),
  );

  // 2. Abstand Berlin ↔ UTC: "GMT+02:00" → 120 Minuten, "GMT+01:00" → 60.
  //    Stunden UND Minuten getrennt lesen – "+0200" als Zahl wäre 200.
  //    (Am Tag der Zeitumstellung gilt der Abstand von `now`, nicht der von
  //    Mitternacht → Grenze 1 h daneben. Für "neueste Zeile von heute" egal.)
  const match = /([+-])(\d{2}):(\d{2})/.exec(part("timeZoneName"));
  const offsetMinutes = match
    ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0; // "GMT" ohne Zusatz = Abstand 0

  // 3. Berliner Mitternacht liegt um den Abstand FRÜHER als UTC-Mitternacht.
  return new Date(midnightAsUtc - offsetMinutes * 60_000).toISOString();
}
