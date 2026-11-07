-- =============================================================================
-- Migration 0006: solar_readings liegt im eigenen Schema ampere_solar
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar. Wurde die Tabelle schon verschoben, bleibt
-- der Umzug unten einfach aus.
--
-- Zusätzlich nötig (geht nicht per SQL): ampere_solar in PGRST_DB_SCHEMAS
-- aufnehmen, siehe docs/learning/02-dashboard.md, Schritt 23.
--
-- tariffs und die Funktionen bleiben in public. Die App erreicht die Tabelle
-- deshalb über supabase.schema("ampere_solar").from("solar_readings").
-- =============================================================================

create schema if not exists ampere_solar;

-- -----------------------------------------------------------------------------
-- Umzug: SET SCHEMA behält Daten, Rechte, RLS, Policies und die Mitgliedschaft
-- in der Realtime-Publication. Nur ausführen, wenn die Tabelle noch im alten
-- und nicht schon im neuen Schema liegt.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.solar_readings') is not null
     and to_regclass('ampere_solar.solar_readings') is null then
    alter table public.solar_readings set schema ampere_solar;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- USAGE ist die "Tür" zum Schema: Ohne sie helfen die Tabellenrechte aus
-- Migration 0001 nicht. Nur authenticated – anon soll hier nichts lesen.
-- Kein GRANT ALL: Die Tabelle bleibt für die App nur lesbar.
-- -----------------------------------------------------------------------------
grant usage on schema ampere_solar to authenticated;

-- -----------------------------------------------------------------------------
-- daily_energy(): Der Funktionskörper ist Text und wird erst beim Aufruf
-- aufgelöst. Er zieht beim Umzug also NICHT mit und muss neu gesetzt werden.
-- Einzige Änderung gegenüber Migration 0003: der Tabellenname. Die Kommentare
-- zur Rechenregel stehen dort. daily_savings() und savings_by_period() bauen
-- hierauf auf und brauchen keine Änderung. Rechte auf die Funktion bleiben bei
-- create or replace erhalten.
-- -----------------------------------------------------------------------------
create or replace function public.daily_energy(p_from date, p_to date)
returns table (
  day                   date,
  pv_kwh                double precision,
  house_kwh             double precision,
  battery_charge_kwh    double precision,
  battery_discharge_kwh double precision,
  grid_import_kwh       double precision,
  grid_export_kwh       double precision,
  measured_hours        double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with readings as (
    select
      ts,
      sys_pv_power,
      sys_house_power,
      sys_battery_power,
      sys_grid_power,
      lead(ts) over (order by ts) as next_ts
    from ampere_solar.solar_readings
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
  'Tagesenergien (kWh) je Berliner Kalendertag aus den sys_*-Minutenwerten. Siehe Migrationen 0003 und 0006.';

notify pgrst, 'reload schema';

-- =============================================================================
-- Prüfen (danach einzeln ausführen):
--
-- 1) Rechte, Policy und Realtime sind mit umgezogen (je mindestens eine Zeile;
--    bei den Rechten: authenticated | SELECT):
--    select grantee, privilege_type from information_schema.role_table_grants
--      where table_schema = 'ampere_solar' and table_name = 'solar_readings';
--    select policyname, roles, cmd from pg_policies
--      where schemaname = 'ampere_solar' and tablename = 'solar_readings';
--    select schemaname, tablename from pg_publication_tables
--      where pubname = 'supabase_realtime' and tablename = 'solar_readings';
--
-- 2) Als eingeloggter Nutzer (erwartet: eine Zeile je Tag):
--    begin; set local role authenticated;
--    select * from public.daily_energy(current_date - 7, current_date);
--    rollback;
--
-- 3) Als anon (erwartet: ERROR permission denied):
--    begin; set local role anon; select count(*) from ampere_solar.solar_readings; rollback;
--
-- 4) Die alte Tabelle ist weg (erwartet: NULL):
--    select to_regclass('public.solar_readings');
-- =============================================================================
