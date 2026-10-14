/**
 * Autarkiegrad und Eigenverbrauchsquote aus Energiesummen.
 *
 * Bewusst getrennt von today.ts: Die Formeln gelten für JEDEN Zeitraum
 * (heute, 7 Tage, Jahr) – der Verlauf in Schritt 17 kann sie wiederverwenden.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import type { TodayTotals } from "@/lib/readings/today";

export type Ratios = {
  /** Anteil des Hausverbrauchs, der NICHT aus dem Netz kam (0–100). */
  autarkyPercent: number | null;
  /** Anteil der PV-Erzeugung, der im Haus blieb (0–100). */
  selfConsumptionPercent: number | null;
  /** Selbst gedeckter Verbrauch in kWh (Zähler des Autarkiegrads). */
  selfSuppliedKwh: number | null;
  /** Selbst genutzter PV-Strom in kWh (Zähler der Eigenverbrauchsquote). */
  selfUsedPvKwh: number | null;
};

/**
 * Autarkie      = (Verbrauch − Netzbezug)  / Verbrauch
 * Eigenverbrauch = (PV − Einspeisung)       / PV
 *
 * Die Batterie taucht nicht direkt auf: Was mittags in den Speicher geht und
 * abends entladen wird, ist weder Netzbezug noch Einspeisung – es zählt
 * automatisch für beide Kennzahlen als "selbst genutzt".
 */
export function toRatios(totals: TodayTotals | null): Ratios {
  const autarky = ratio(totals?.loadKwh, totals?.gridImportKwh);
  const selfConsumption = ratio(totals?.pvKwh, totals?.gridExportKwh);

  return {
    autarkyPercent: autarky.percent,
    selfConsumptionPercent: selfConsumption.percent,
    selfSuppliedKwh: autarky.part,
    selfUsedPvKwh: selfConsumption.part,
  };
}

/**
 * (gesamt − abgang) / gesamt als Prozent.
 *
 * `null` statt einer Zahl, wenn der Wert nicht sinnvoll ist: fehlende Daten
 * oder gesamt = 0 (nachts gibt es keine PV – "0 % Eigenverbrauch" wäre falsch,
 * es gibt schlicht nichts zu verbrauchen). Durch 0 teilen ergäbe NaN.
 *
 * Auf 0–100 begrenzt: Durch Messungenauigkeit kann abgang minimal größer
 * als gesamt sein; ein Anteil von −1 % ergibt keinen Sinn.
 */
function ratio(
  total: number | null | undefined,
  outflow: number | null | undefined,
): { percent: number | null; part: number | null } {
  if (total == null || outflow == null || total <= 0) {
    return { percent: null, part: null };
  }
  const part = Math.min(Math.max(total - outflow, 0), total);
  return { percent: (part / total) * 100, part };
}
