/**
 * Rundet für Tool-Antworten. Mehr Nachkommastellen täuschen eine Genauigkeit
 * vor, die die Minutenwerte nicht haben, und kosten nur Tokens.
 * `null`/`undefined` bleibt `null` = „kein Wert“, nie 0.
 */
export function round(value: number, digits: number): number;
export function round(value: number | null | undefined, digits: number): number | null;
export function round(value: number | null | undefined, digits: number): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
