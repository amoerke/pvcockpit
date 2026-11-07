-- =============================================================================
-- Migration 0007: Alle Objekte der App liegen im Schema ampere_solar
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar und passt für jeden Ausgangsstand: Was schon
-- verschoben ist, bleibt, wo es ist. Korrigiert auch die Annahme aus Migration
-- 0006, dass tariffs und die Funktionen in public bleiben.
--
-- Warum die Funktionen neu setzen, auch wenn sie schon verschoben sind?
--   Ein Funktionskörper ist Text und wird erst beim Aufruf aufgelöst. Beim
--   Verschieben bleiben darin die alten Namen stehen (public.daily_energy …).
--
-- Rechenregeln und ihre Begründung: siehe Migrationen 0003, 0004 und 0005.
-- =============================================================================

create schema if not exists ampere_solar;
grant usage on schema ampere_solar to authenticated;

-- -----------------------------------------------------------------------------
-- Tabellen: SET SCHEMA behält Daten, Rechte, RLS und Policies. Nur verschieben,
-- wenn die Tabelle noch im alten und nicht schon im neuen Schema liegt.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['solar_readings', 'tariffs'] loop
    if to_regclass('public.' || t) is not null
       and to_regclass('ampere_solar.' || t) is null then
      execute format('alter table public.%I set schema ampere_solar', t);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funktionen in Aufruf-Reihenfolge: Postgres prüft den Körper schon beim
-- Anlegen, die jeweils aufgerufene Funktion muss also bereits existieren.
-- -----------------------------------------------------------------------------
create or replace function ampere_solar.daily_energy(p_from date, p_to date)
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

create or replace function ampere_solar.daily_savings(p_from date, p_to date)
returns table (
  day                  date,
  self_consumption_kwh double precision,
  grid_export_kwh      double precision,
  price_ct_per_kwh     numeric,
  feed_in_ct_per_kwh   numeric,
  savings_eur          numeric,
  feed_in_eur          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.day,
    greatest(e.house_kwh - e.grid_import_kwh, 0),
    e.grid_export_kwh,
    t.price_ct_per_kwh,
    t.feed_in_ct_per_kwh,
    greatest(e.house_kwh - e.grid_import_kwh, 0)::numeric * t.price_ct_per_kwh / 100,
    e.grid_export_kwh::numeric * t.feed_in_ct_per_kwh / 100
  from ampere_solar.daily_energy(p_from, p_to) as e
  left join lateral (
    select tr.price_ct_per_kwh, tr.feed_in_ct_per_kwh
    from ampere_solar.tariffs as tr
    where tr.valid_from <= e.day
    order by tr.valid_from desc
    limit 1
  ) as t on true
  order by e.day;
$$;

create or replace function ampere_solar.savings_by_period(p_from date, p_to date, p_bucket text)
returns table (
  period               text,
  self_consumption_kwh double precision,
  grid_export_kwh      double precision,
  savings_eur          numeric,
  feed_in_eur          numeric,
  days_with_data       integer,
  days_without_tariff  integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    to_char(
      s.day,
      case p_bucket when 'day' then 'YYYY-MM-DD' when 'month' then 'YYYY-MM' else 'YYYY' end
    ) as period,
    coalesce(sum(s.self_consumption_kwh) filter (where s.savings_eur is not null), 0),
    coalesce(sum(s.grid_export_kwh) filter (where s.savings_eur is not null), 0),
    sum(s.savings_eur),
    sum(s.feed_in_eur),
    count(*)::integer,
    (count(*) filter (where s.savings_eur is null))::integer
  from ampere_solar.daily_savings(p_from, p_to) as s
  where p_bucket in ('day', 'month', 'year')
  group by 1
  order by 1;
$$;

comment on function ampere_solar.daily_energy(date, date) is
  'Tagesenergien (kWh) je Berliner Kalendertag aus den sys_*-Minutenwerten. Siehe Migrationen 0003 und 0007.';
comment on function ampere_solar.daily_savings(date, date) is
  'Ersparnis und Einspeisevergütung (€) je Berliner Kalendertag mit dem jeweils gültigen Tarif. Siehe Migrationen 0004 und 0007.';
comment on function ampere_solar.savings_by_period(date, date, text) is
  'Ersparnis und Einspeisevergütung je Tag, Monat oder Jahr (p_bucket). Siehe Migrationen 0005 und 0007.';

-- Neu angelegte Funktionen darf standardmäßig JEDER ausführen. Wie bisher: nur
-- Eingeloggte. Auch hier setzen, weil die Funktionen eben neu entstanden sein können.
revoke execute on function ampere_solar.daily_energy(date, date) from public, anon;
revoke execute on function ampere_solar.daily_savings(date, date) from public, anon;
revoke execute on function ampere_solar.savings_by_period(date, date, text) from public, anon;
grant execute on function ampere_solar.daily_energy(date, date) to authenticated;
grant execute on function ampere_solar.daily_savings(date, date) to authenticated;
grant execute on function ampere_solar.savings_by_period(date, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Alte Exemplare in public entfernen. Migration 0006 hat public.daily_energy
-- eventuell neu angelegt, obwohl die Funktion schon verschoben war.
-- -----------------------------------------------------------------------------
drop function if exists public.savings_by_period(date, date, text);
drop function if exists public.daily_savings(date, date);
drop function if exists public.daily_energy(date, date);

notify pgrst, 'reload schema';

-- =============================================================================
-- Prüfen (danach einzeln ausführen):
--
-- 1) Alles liegt in ampere_solar (erwartet: nur Zeilen mit diesem Schema, drei
--    Funktionen):
--    select n.nspname, p.proname from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--      where p.proname in ('daily_energy', 'daily_savings', 'savings_by_period');
--    select to_regclass('public.solar_readings'), to_regclass('public.tariffs'),
--           to_regclass('ampere_solar.solar_readings'), to_regclass('ampere_solar.tariffs');
--
-- 2) Als eingeloggter Nutzer (erwartet: eine Zeile je Monat mit Euro-Werten):
--    begin; set local role authenticated;
--    select * from ampere_solar.savings_by_period(current_date - 60, current_date, 'month');
--    rollback;
--
-- 3) Als anon (erwartet: ERROR permission denied for schema ampere_solar):
--    begin; set local role anon;
--    select * from ampere_solar.savings_by_period(current_date, current_date, 'day');
--    rollback;
-- =============================================================================
