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

export function formatTime(isoTimestamp: string): string {
  return timeFormat.format(new Date(isoTimestamp));
}
