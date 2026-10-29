/**
 * Tool-Logik für get_live_status: der neueste Messwert, aufbereitet fürs
 * Modell. Die Vorzeichen-Logik steckt in toLiveReading() – dieselbe wie in
 * den Live-Kacheln.
 *
 * Bewusst ohne "server-only": reine Logik, testbar. "Jetzt" kommt als
 * Parameter, wie bei minutesSince().
 */
import { round } from "@/lib/assistant/round";
import { minutesSince, toLiveReading, type LiveRow } from "@/lib/readings/live";
import { TIME_ZONE } from "@/lib/time";

/**
 * Antwort von get_live_status. Leistungen in Watt, immer ≥ 0 – die
 * Richtung steckt im Feldnamen (charge/discharge, import/export).
 */
export type LiveStatus = {
  /** Ortszeit Berlin, z. B. "2026-10-29 20:10" – ohne Umrechnen lesbar. */
  measured_at: string;
  /** Alter des Messwerts. Mehr als ein paar Minuten = Logger hängt evtl. */
  age_minutes: number;
  pv_w: number | null;
  house_w: number | null;
  battery_soc_percent: number | null;
  battery_charge_w: number | null;
  battery_discharge_w: number | null;
  grid_import_w: number | null;
  grid_export_w: number | null;
};

export function toLiveStatus(row: LiveRow, now: number): LiveStatus {
  const reading = toLiveReading(row);

  return {
    measured_at: berlinDateTime(reading.timestamp),
    age_minutes: round(minutesSince(reading.timestamp, now), 0),
    pv_w: round(reading.pvW, 0),
    house_w: round(reading.loadW, 0),
    battery_soc_percent: reading.socPercent,
    battery_charge_w: round(reading.batteryChargeW, 0),
    battery_discharge_w: round(reading.batteryDischargeW, 0),
    grid_import_w: round(reading.gridImportW, 0),
    grid_export_w: round(reading.gridExportW, 0),
  };
}

/** "2026-10-29 20:10" in Berliner Ortszeit (sv-SE liefert genau dieses Format). */
function berlinDateTime(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
