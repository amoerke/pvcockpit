/**
 * Formatierung für die Oberfläche (deutsch).
 *
 * Intl.NumberFormat / Intl.DateTimeFormat sind im Browser und in Node.js
 * eingebaut. Sie kennen die deutschen Regeln (Komma, Tausenderpunkt) – also
 * kein eigenes toFixed()/replace(".", ",").
 *
 * Die Formatter werden einmal erzeugt und wiederverwendet (das Erzeugen ist
 * vergleichsweise teuer).
 */

const integerFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const oneDecimalFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Platzhalter für "kein Messwert" – bewusst nicht "0". */
export const NO_VALUE = "–";

/** 447 → "447 W", 2380 → "2,4 kW" */
export function formatPower(watts: number | null): string {
  if (watts === null) return NO_VALUE;
  if (Math.abs(watts) < 1000) return `${integerFormat.format(watts)} W`;
  return `${oneDecimalFormat.format(watts / 1000)} kW`;
}

/** 12.34 → "12,3 kWh" */
export function formatEnergy(kwh: number | null): string {
  if (kwh === null) return NO_VALUE;
  return `${oneDecimalFormat.format(kwh)} kWh`;
}

/**
 * Achsenbeschriftung: 24 → "24 kWh", 7.5 → "7,5 kWh". Ohne erzwungene
 * Nachkommastelle – "24,0 kWh" wäre zu breit für die Achse.
 */
const tickFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function formatEnergyTick(kwh: number): string {
  return `${tickFormat.format(kwh)} kWh`;
}

/**
 * Euro mit Cent: 3.29 → "3,29 €". style "currency" kennt die deutsche
 * Schreibweise (Komma, Leerzeichen vor €) – kein eigenes Zusammensetzen.
 */
const euroFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatEuro(eur: number | null): string {
  if (eur === null) return NO_VALUE;
  return euroFormat.format(eur);
}

/**
 * Achsenbeschriftung: 3 → "3 €", 0.005 → "0,005 €" – ohne erzwungene Cents.
 * Drei Stellen statt zwei: Die Einspeisung liegt bei wenigen Cent pro Tag,
 * Recharts setzt Striche bei 0,005 € – auf Cent gerundet stünde dort zweimal
 * "0,01 €".
 */
const euroTickFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatEuroTick(eur: number): string {
  return euroTickFormat.format(eur);
}

/** 20.9 → "21 %" */
export function formatPercent(value: number | null): string {
  if (value === null) return NO_VALUE;
  return `${integerFormat.format(value)} %`;
}

/**
 * Uhrzeit in deutscher Ortszeit, z. B. "22:12".
 *
 * timeZone ist PFLICHT: Ohne Angabe nimmt Intl die Zeitzone des Rechners.
 * Auf dem Server (z. B. später beim Hosting) ist das oft UTC – die Seite
 * zeigte dann 20:12 statt 22:12.
 */
const timeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/** Nimmt ISO-Strings ("2026-10-14T16:26:00Z") und ms-Zahlen (x-Achse im Diagramm). */
export function formatTime(timestamp: string | number): string {
  return timeFormat.format(new Date(timestamp));
}

/**
 * "2026-10-14" → "Mittwoch, 14. Oktober 2026".
 *
 * Hier ausnahmsweise timeZone "UTC": Der Text ist schon ein Berliner
 * Kalendertag. Date.UTC(…) + Formatieren in UTC gibt genau diesen Tag
 * zurück – mit Berliner Zeitzone könnte er sich verschieben.
 */
const dayFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Wie formatDay: Der Text ist schon ein Berliner Tag → in UTC formatieren. */
function utcDate(day: string): Date {
  const [y, m, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const shortDayFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

/** "2026-10-13" → "13.10." (Achse im Balkendiagramm) */
export function formatShortDay(day: string): string {
  return shortDayFormat.format(utcDate(day));
}

const monthFormat = new Intl.DateTimeFormat("de-DE", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** "2026-10" → "Okt. 26" */
export function formatMonth(month: string): string {
  return monthFormat.format(utcDate(month));
}

const rangeFormat = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "2026-10-08", "2026-10-14" → "8.–14. Oktober 2026".
 * formatRange() lässt weg, was sich wiederholt (Monat, Jahr) – das müsste
 * man sonst selbst zusammenbauen.
 */
export function formatDayRange(from: string, to: string): string {
  return rangeFormat.formatRange(utcDate(from), utcDate(to));
}
