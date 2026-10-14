-- =============================================================================
-- Migration 0003: Funktion daily_energy() – Tagesenergien in der Datenbank
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar (create or replace).
--
-- Warum in der Datenbank?
--   Für "heute" lädt die App ~1.440 Minutenwerte und summiert selbst
--   (lib/readings/today.ts). Für ein Jahr wären das ~525.000 Zeilen – in
--   Seiten zu je 1.000 über das Netz. Stattdessen rechnet Postgres dort, wo
--   die Daten liegen, und schickt nur 365 Ergebniszeilen.
--
-- Gleiche Rechenregel wie toTodayTotals() in der App:
--   Energie [Wh] = Σ Leistung [W] × Dauer bis zur nächsten Messung [h]
--   - Lücken über 5 Minuten zählen nicht (Logger-Ausfall).
--   - Zeilen ohne sys_*-Werte (vor dem 06.10.2026) zählen nicht.
--   - Vorzeichen getrennt: Batterie +entladen/−laden, Netz +Bezug/−Einspeisung.
--   - Tagesgrenzen in Europe/Berlin (inkl. Sommer-/Winterzeit).
--
-- Aufruf aus der App (PostgREST macht Funktionen unter /rpc/ verfügbar):
--   supabase.rpc("daily_energy", { p_from: "2026-10-01", p_to: "2026-10-14" })
-- =============================================================================

create or replace function public.daily_energy(p_from date, p_to date)
returns table (
  day                   date,
  pv_kwh                double precision,
  house_kwh             double precision,
  battery_charge_kwh    double precision,
  battery_discharge_kwh double precision,
  grid_import_kwh       double precision,
  grid_export_kwh       double precision,
  -- Wie viele Stunden des Tages tatsächlich gemessen wurden (max. 24 bzw.
  -- 23/25 an den Tagen der Zeitumstellung). Zeigt Tage mit Ausfällen.
  measured_hours        double precision
)
language sql
-- stable: liest nur, ändert nichts → Postgres darf das Ergebnis innerhalb
-- einer Abfrage wiederverwenden. (volatile wäre der Standard.)
stable
-- security invoker: läuft mit den Rechten des AUFRUFERS. RLS und die Rechte
-- aus Migration 0001 gelten also auch hier – anon bekäme nichts.
-- (security definer liefe als Besitzer "postgres" und umginge RLS.)
security invoker
-- Leerer search_path: Jeder Name muss mit Schema geschrieben werden
-- (public.solar_readings). So kann niemand eine gleichnamige Tabelle in
-- einem anderen Schema "unterschieben".
set search_path = ''
as $$
  with readings as (
    select
      ts,
      sys_pv_power,
      sys_house_power,
      sys_battery_power,
      sys_grid_power,
      -- Fensterfunktion: Zeitstempel der NÄCHSTEN Zeile (nach ts sortiert).
      -- Ersetzt die Schleife "rows[i + 1]" aus der App.
      lead(ts) over (order by ts) as next_ts
    from public.solar_readings
    -- Datum → Berliner Mitternacht → timestamptz. Postgres kennt die
    -- Zeitumstellung, kein Rechnen mit festen +1/+2 Stunden nötig.
    -- Die Bedingung direkt auf ts nutzt den Index des UNIQUE-Constraints.
    where ts >= (p_from::timestamp at time zone 'Europe/Berlin')
      and ts <  ((p_to + 1)::timestamp at time zone 'Europe/Berlin')
  ),
  intervals as (
    select
      (ts at time zone 'Europe/Berlin')::date as day,
      extract(epoch from next_ts - ts) / 3600.0 as h,
      sys_pv_power,
      sys_house_power,
      sys_battery_power,
      sys_grid_power
    from readings
    where next_ts > ts
      and next_ts - ts <= interval '5 minutes'
      and sys_pv_power is not null
      and sys_house_power is not null
      and sys_battery_power is not null
      and sys_grid_power is not null
  )
  select
    day,
    (sum(greatest(sys_pv_power, 0)      * h) / 1000)::double precision,
    (sum(greatest(sys_house_power, 0)   * h) / 1000)::double precision,
    (sum(greatest(-sys_battery_power, 0) * h) / 1000)::double precision,
    (sum(greatest(sys_battery_power, 0)  * h) / 1000)::double precision,
    (sum(greatest(sys_grid_power, 0)     * h) / 1000)::double precision,
    (sum(greatest(-sys_grid_power, 0)    * h) / 1000)::double precision,
    sum(h)::double precision
  from intervals
  group by day
  order by day;
$$;

comment on function public.daily_energy(date, date) is
  'Tagesenergien (kWh) je Berliner Kalendertag aus den sys_*-Minutenwerten. Siehe Migration 0003.';

-- -----------------------------------------------------------------------------
-- Rechte: Postgres erlaubt neue Funktionen standardmäßig JEDEM (PUBLIC),
-- Supabase zusätzlich anon/authenticated. Wie bei der Tabelle: nur Eingeloggte.
-- (Wegen security invoker würde anon ohnehin an der Tabelle scheitern –
-- das Entziehen hier ist die zweite Schicht.)
-- -----------------------------------------------------------------------------
revoke execute on function public.daily_energy(date, date) from public, anon;
grant execute on function public.daily_energy(date, date) to authenticated;

-- PostgREST lädt sein Schema-Abbild neu, damit /rpc/daily_energy sofort
-- erreichbar ist (sonst erst nach dem nächsten Neustart).
notify pgrst, 'reload schema';

-- =============================================================================
-- Prüfen (danach einzeln ausführen):
--
-- 1) Als eingeloggter Nutzer: die letzten Tage (erwartet: eine Zeile je Tag,
--    13.10. ≈ PV 16,4 / Haus 22,8 / Bezug 7,0 kWh wie im Verlauf der App)
--    begin; set local role authenticated;
--    select * from public.daily_energy(current_date - 7, current_date);
--    rollback;
--
-- 2) Als anon (erwartet: ERROR permission denied for function daily_energy)
--    begin; set local role anon; select * from public.daily_energy(current_date, current_date); rollback;
--
-- 3) Laufzeit für ein ganzes Jahr ("Execution Time" am Ende der Ausgabe):
--    explain analyze select * from public.daily_energy(current_date - 365, current_date);
-- =============================================================================
