-- =============================================================================
-- Migration 0004: Tabelle tariffs und Funktion daily_savings()
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar (if not exists, create or replace,
-- on conflict do nothing).
--
-- Idee:
--   - tariffs: ein Preis gilt AB einem Datum, bis die nächste Zeile beginnt.
--     Preisänderung = neue Zeile einfügen, alte bleibt stehen. So rechnen
--     vergangene Zeiträume weiter mit dem damals gültigen Preis.
--   - daily_savings(): nimmt die Tagesenergien aus daily_energy() (Migration
--     0003) und multipliziert sie mit dem am jeweiligen Tag gültigen Tarif.
--
-- Rechenregel:
--   Eigenverbrauch [kWh] = Hausverbrauch − Netzbezug
--                          (Strom vom Dach, direkt oder über die Batterie)
--   Ersparnis [€]        = Eigenverbrauch × Arbeitspreis
--   Einspeisung [€]      = Einspeisung [kWh] × Einspeisevergütung
--   Der Grundpreis fehlt bewusst: Er fällt mit und ohne PV gleich an.
--
-- Neuen Preis eintragen (Beispiel):
--   insert into public.tariffs (valid_from, price_ct_per_kwh, feed_in_ct_per_kwh)
--   values ('2027-01-01', 29.5, 8);
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------
create table if not exists public.tariffs (
  -- Primärschlüssel auf dem Datum: Pro Tag kann nur EIN Tarif beginnen.
  -- Der Index dazu macht "letzter Tarif mit valid_from <= Tag" schnell.
  valid_from         date primary key,
  -- numeric statt double precision: Geldbeträge exakt, ohne Rundungsfehler
  -- der Gleitkommazahlen (0.1 + 0.2 ≠ 0.3). Werte brutto in Cent pro kWh.
  price_ct_per_kwh   numeric(7, 3) not null check (price_ct_per_kwh > 0),
  feed_in_ct_per_kwh numeric(7, 3) not null check (feed_in_ct_per_kwh >= 0)
);

comment on table public.tariffs is
  'Strompreis und Einspeisevergütung (ct/kWh brutto), gültig ab valid_from bis zur nächsten Zeile. Siehe Migration 0004.';

-- Erster Tarif: gültig ab dem Tag der ersten Messung (Berliner Datum).
-- insert … select statt fester Zahl – das Datum steht schon in den Daten.
-- on conflict do nothing: Beim zweiten Ausführen passiert nichts.
insert into public.tariffs (valid_from, price_ct_per_kwh, feed_in_ct_per_kwh)
select (min(ts) at time zone 'Europe/Berlin')::date, 27.87, 8
from public.solar_readings
having min(ts) is not null
on conflict (valid_from) do nothing;

-- -----------------------------------------------------------------------------
-- Rechte und RLS – wie bei solar_readings (Migration 0001):
-- Eingeloggte lesen, niemand schreibt über die API. Preise pflegst du im
-- SQL-Editor (Rolle postgres, nicht von RLS betroffen).
-- -----------------------------------------------------------------------------
alter table public.tariffs enable row level security;

revoke all on table public.tariffs from anon, authenticated;
grant select on table public.tariffs to authenticated;

drop policy if exists "Eingeloggte Nutzer duerfen Tarife lesen" on public.tariffs;
create policy "Eingeloggte Nutzer duerfen Tarife lesen"
  on public.tariffs
  for select
  to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- Funktion
-- -----------------------------------------------------------------------------
create or replace function public.daily_savings(p_from date, p_to date)
returns table (
  day                  date,
  self_consumption_kwh double precision,
  grid_export_kwh      double precision,
  -- Der am Tag gültige Tarif – null, wenn für den Tag keiner hinterlegt ist.
  price_ct_per_kwh     numeric,
  feed_in_ct_per_kwh   numeric,
  savings_eur          numeric,
  feed_in_eur          numeric
)
language sql
-- Gleiche Optionen wie daily_energy() – Begründung siehe Migration 0003.
stable
security invoker
set search_path = ''
as $$
  select
    e.day,
    -- greatest(…, 0): Messrauschen könnte den Bezug minimal über den
    -- Verbrauch heben – negativer Eigenverbrauch ergäbe keinen Sinn.
    greatest(e.house_kwh - e.grid_import_kwh, 0),
    e.grid_export_kwh,
    t.price_ct_per_kwh,
    t.feed_in_ct_per_kwh,
    -- kWh × ct/kWh = ct → / 100 = €. Erst nach numeric wandeln, damit ab
    -- hier exakt gerechnet wird. Gerundet wird erst in der Anzeige.
    greatest(e.house_kwh - e.grid_import_kwh, 0)::numeric * t.price_ct_per_kwh / 100,
    e.grid_export_kwh::numeric * t.feed_in_ct_per_kwh / 100
  from public.daily_energy(p_from, p_to) as e
  -- LATERAL: Die Unterabfrage läuft EINMAL PRO TAG und darf e.day benutzen.
  -- Sie holt die jüngste Tarifzeile, die an diesem Tag schon galt.
  -- LEFT JOIN … ON true: Tage ohne Tarif bleiben erhalten (mit null).
  left join lateral (
    select tr.price_ct_per_kwh, tr.feed_in_ct_per_kwh
    from public.tariffs as tr
    where tr.valid_from <= e.day
    order by tr.valid_from desc
    limit 1
  ) as t on true
  order by e.day;
$$;

comment on function public.daily_savings(date, date) is
  'Ersparnis und Einspeisevergütung (€) je Berliner Kalendertag mit dem jeweils gültigen Tarif. Siehe Migration 0004.';

revoke execute on function public.daily_savings(date, date) from public, anon;
grant execute on function public.daily_savings(date, date) to authenticated;

commit;

notify pgrst, 'reload schema';

-- =============================================================================
-- Prüfen (danach einzeln ausführen):
--
-- 1) Tarif angelegt? (erwartet: eine Zeile, Datum der ersten Messung, 27.870 / 8.000)
--    select * from public.tariffs;
--
-- 2) Als eingeloggter Nutzer die letzten Tage
--    (erwartet: savings_eur ≈ self_consumption_kwh × 0,2787, feed_in_eur ≈ grid_export_kwh × 0,08)
--    begin; set local role authenticated;
--    select * from public.daily_savings(current_date - 7, current_date);
--    rollback;
--
-- 3) Als anon (erwartet: ERROR permission denied for function daily_savings)
--    begin; set local role anon; select * from public.daily_savings(current_date, current_date); rollback;
--
-- 4) Typen: in lib/supabase/database.types.ts von Hand ergänzt (DB von außen
--    nicht erreichbar, npm run db:types geht derzeit nicht).
-- =============================================================================
