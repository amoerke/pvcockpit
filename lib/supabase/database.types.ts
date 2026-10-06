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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Kurzform: `Tables<"solar_readings">` = Typ einer gelesenen Zeile. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
