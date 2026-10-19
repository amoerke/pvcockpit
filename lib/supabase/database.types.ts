// VORLÄUFIG VON HAND GESCHRIEBEN nach supabase/schema.sql – im selben Format,
// das `supabase gen types` erzeugt. Wird durch `npm run db:types` ersetzt
// (siehe scripts/gen-db-types.sh). Danach diese Datei nicht mehr von Hand ändern.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      solar_readings: {
        // Row: so sieht eine gelesene Zeile aus (SELECT).
        Row: {
          id: number;
          ts: string; // timestamptz kommt als ISO-String, z. B. "2026-10-04T12:00:00+00:00"
          pv_power: number | null;
          raw_power_block: Json | null;
          battery_power: number | null;
          grid_power: number | null;
          total_grid_power: number | null;
          load_power: number | null;
          inverter_power: number | null;
          direction_pv: number | null;
          direction_battery: number | null;
          direction_grid: number | null;
          soc: number | null;
          bat_temp: number | null;
          pv1_voltage: number | null;
          pv1_current: number | null;
          pv1_power: number | null;
          pv2_voltage: number | null;
          pv2_current: number | null;
          pv2_power: number | null;
          pv_today_kwh: number | null;
          pv_total_kwh: number | null;
          bat_charge_today_kwh: number | null;
          bat_discharge_today_kwh: number | null;
          load_today_kwh: number | null;
          grid_export_today_kwh: number | null;
          grid_import_today_kwh: number | null;
          offset14_power: number | null;
          raw_string_block: Json | null;
          pv3_voltage: number | null;
          pv3_current: number | null;
          pv3_power: number | null;
          sys_pv_power: number | null;
          sys_battery_power: number | null;
          sys_grid_power: number | null;
          sys_house_power: number | null;
          sys_soc: number | null;
        };
        // Insert: Pflichtfelder ohne "?" (hier nur ts; id erzeugt die DB).
        Insert: {
          id?: never; // GENERATED ALWAYS – darf nicht gesetzt werden
          ts: string;
          pv_power?: number | null;
          raw_power_block?: Json | null;
          battery_power?: number | null;
          grid_power?: number | null;
          total_grid_power?: number | null;
          load_power?: number | null;
          inverter_power?: number | null;
          direction_pv?: number | null;
          direction_battery?: number | null;
          direction_grid?: number | null;
          soc?: number | null;
          bat_temp?: number | null;
          pv1_voltage?: number | null;
          pv1_current?: number | null;
          pv1_power?: number | null;
          pv2_voltage?: number | null;
          pv2_current?: number | null;
          pv2_power?: number | null;
          pv_today_kwh?: number | null;
          pv_total_kwh?: number | null;
          bat_charge_today_kwh?: number | null;
          bat_discharge_today_kwh?: number | null;
          load_today_kwh?: number | null;
          grid_export_today_kwh?: number | null;
          grid_import_today_kwh?: number | null;
          offset14_power?: number | null;
          raw_string_block?: Json | null;
          pv3_voltage?: number | null;
          pv3_current?: number | null;
          pv3_power?: number | null;
          sys_pv_power?: number | null;
          sys_battery_power?: number | null;
          sys_grid_power?: number | null;
          sys_house_power?: number | null;
          sys_soc?: number | null;
        };
        // Update: alles optional (nur geänderte Felder).
        Update: {
          id?: never;
          ts?: string;
          pv_power?: number | null;
          raw_power_block?: Json | null;
          battery_power?: number | null;
          grid_power?: number | null;
          total_grid_power?: number | null;
          load_power?: number | null;
          inverter_power?: number | null;
          direction_pv?: number | null;
          direction_battery?: number | null;
          direction_grid?: number | null;
          soc?: number | null;
          bat_temp?: number | null;
          pv1_voltage?: number | null;
          pv1_current?: number | null;
          pv1_power?: number | null;
          pv2_voltage?: number | null;
          pv2_current?: number | null;
          pv2_power?: number | null;
          pv_today_kwh?: number | null;
          pv_total_kwh?: number | null;
          bat_charge_today_kwh?: number | null;
          bat_discharge_today_kwh?: number | null;
          load_today_kwh?: number | null;
          grid_export_today_kwh?: number | null;
          grid_import_today_kwh?: number | null;
          offset14_power?: number | null;
          raw_string_block?: Json | null;
          pv3_voltage?: number | null;
          pv3_current?: number | null;
          pv3_power?: number | null;
          sys_pv_power?: number | null;
          sys_battery_power?: number | null;
          sys_grid_power?: number | null;
          sys_house_power?: number | null;
          sys_soc?: number | null;
        };
        Relationships: [];
      };
      // Migration 0004. numeric kommt als number; date als "YYYY-MM-DD".
      tariffs: {
        Row: {
          valid_from: string;
          price_ct_per_kwh: number;
          feed_in_ct_per_kwh: number;
        };
        Insert: {
          valid_from: string;
          price_ct_per_kwh: number;
          feed_in_ct_per_kwh: number;
        };
        Update: {
          valid_from?: string;
          price_ct_per_kwh?: number;
          feed_in_ct_per_kwh?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // Migration 0003. Args: date kommt/geht als "YYYY-MM-DD"-String.
      // Returns als Array: Die Funktion liefert eine Tabelle (eine Zeile je Tag).
      daily_energy: {
        Args: { p_from: string; p_to: string };
        Returns: {
          day: string;
          pv_kwh: number;
          house_kwh: number;
          battery_charge_kwh: number;
          battery_discharge_kwh: number;
          grid_import_kwh: number;
          grid_export_kwh: number;
          measured_hours: number;
        }[];
      };
      // Migration 0004. Tarif- und €-Spalten sind null, wenn für den Tag
      // kein Tarif hinterlegt ist (LEFT JOIN). Der Generator würde hier
      // `number` schreiben – `number | null` ist ehrlicher.
      daily_savings: {
        Args: { p_from: string; p_to: string };
        Returns: {
          day: string;
          self_consumption_kwh: number;
          grid_export_kwh: number;
          price_ct_per_kwh: number | null;
          feed_in_ct_per_kwh: number | null;
          savings_eur: number | null;
          feed_in_eur: number | null;
        }[];
      };
      // Migration 0005. € null = im Zeitraum kein Tag mit Tarif.
      savings_by_period: {
        Args: { p_from: string; p_to: string; p_bucket: string };
        Returns: {
          period: string;
          self_consumption_kwh: number;
          grid_export_kwh: number;
          savings_eur: number | null;
          feed_in_eur: number | null;
          days_with_data: number;
          days_without_tariff: number;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Kurzform: `Tables<"solar_readings">` = Typ einer gelesenen Zeile. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
