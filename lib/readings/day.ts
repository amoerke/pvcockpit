/**
 * Tagesverlauf: Minutenwerte → Kurve in 5-Minuten-Schritten.
 *
 * Warum verdichten? 1.440 Punkte × 4 Linien wären für das Diagramm unnötig
 * viel – mehr Punkte, als der Bildschirm Pixel breit ist. Und alles, was eine
 * Server Component an eine Client Component gibt, reist als Daten mit ins
 * HTML. 288 Mittelwerte sehen gleich aus und sind ein Fünftel davon.
 *
 * Bewusst ohne "server-only": reine Logik, testbar.
 */
import type { TodayRow } from "@/lib/readings/today";

/** Ein Punkt der Kurve. Watt; `null` = keine Messung in diesem Abschnitt. */
export type CurvePoint = {
  /** Beginn des Abschnitts in ms seit 1970 (Zahl, damit die x-Achse rechnen kann). */
  t: number;
  pv: number | null;
  house: number | null;
  /** positiv = entladen, negativ = laden */
  battery: number | null;
  /** positiv = Bezug, negativ = Einspeisung */
  grid: number | null;
};

const BUCKET_MS = 5 * 60_000;

/**
 * Mittelt die Zeilen in 5-Minuten-Abschnitten ab `startMs` bis `endMs`.
 * Abschnitte ohne Messung bleiben als Punkt mit `null` erhalten – so zeigt
 * das Diagramm eine Lücke, statt einen Ausfall des Loggers zu überbrücken.
 */
export function toDayCurve(rows: TodayRow[], startMs: number, endMs: number): CurvePoint[] {
  const count = Math.ceil((endMs - startMs) / BUCKET_MS);
  const sums = Array.from({ length: count }, () => ({
    pv: 0,
    house: 0,
    battery: 0,
    grid: 0,
    n: 0,
  }));

  for (const row of rows) {
    const { sys_pv_power, sys_house_power, sys_battery_power, sys_grid_power } = row;
    if (
      sys_pv_power === null ||
      sys_house_power === null ||
      sys_battery_power === null ||
      sys_grid_power === null
    ) {
      continue;
    }
    const index = Math.floor((Date.parse(row.ts) - startMs) / BUCKET_MS);
    const bucket = sums[index];
    if (!bucket) continue; // außerhalb des Tages

    // Nachts meldet der Wechselrichter wenige Watt Standby als PV → 0.
    bucket.pv += Math.max(sys_pv_power, 0);
    bucket.house += sys_house_power;
    bucket.battery += sys_battery_power;
    bucket.grid += sys_grid_power;
    bucket.n++;
  }

  return sums.map((s, i) => {
    const avg = (sum: number) => (s.n > 0 ? Math.round(sum / s.n) : null);
    return {
      t: startMs + i * BUCKET_MS,
      pv: avg(s.pv),
      house: avg(s.house),
      battery: avg(s.battery),
      grid: avg(s.grid),
    };
  });
}
