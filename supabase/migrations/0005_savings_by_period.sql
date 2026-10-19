-- =============================================================================
-- Migration 0005: Funktion savings_by_period() – Ersparnis je Tag, Monat
-- oder Jahr, zusammengefasst in der Datenbank
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar (create or replace).
--
-- Warum?
--   PostgREST liefert höchstens 1.000 Zeilen – auch bei rpc(). daily_savings()
--   gibt eine Zeile PRO TAG zurück; "Alles" hätte nach ~2¾ Jahren mehr Tage,
--   und die neuesten fehlten still in der Summe. Hier wird schon in Postgres
--   je Tag/Monat/Jahr gruppiert: höchstens ~60 Tage, 36 Monate oder ein paar
--   Jahre kommen zurück.
--
-- Baut auf daily_savings() (Migration 0004) auf – Rechenregel und Tarif-
-- Zuordnung stehen weiter nur dort.
--
-- Aufruf aus der App:
--   supabase.rpc("savings_by_period", { p_from: "2026-09-15", p_to: "2026-10-19", p_bucket: "month" })
-- =============================================================================

create or replace function public.savings_by_period(p_from date, p_to date, p_bucket text)
returns table (
  -- "2026-10-13" (day), "2026-10" (month) bzw. "2026" (year) – dieselben
  -- Schlüssel, die die App für ihre Balken verwendet.
  period               text,
  self_consumption_kwh double precision,
  grid_export_kwh      double precision,
  savings_eur          numeric,
  feed_in_eur          numeric,
  -- Tage mit Messwerten bzw. davon ohne hinterlegten Tarif
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
    -- FILTER: nur Tage MIT Tarif zählen – wie die Euro-Summen, die Tage
    -- ohne Tarif (null) ohnehin auslassen. So passen kWh und € zusammen.
    coalesce(sum(s.self_consumption_kwh) filter (where s.savings_eur is not null), 0),
    coalesce(sum(s.grid_export_kwh) filter (where s.savings_eur is not null), 0),
    -- sum() über nur null-Werte ergibt null → "kein Tarif" bleibt erkennbar.
    sum(s.savings_eur),
    sum(s.feed_in_eur),
    count(*)::integer,
    (count(*) filter (where s.savings_eur is null))::integer
  from public.daily_savings(p_from, p_to) as s
  -- Unbekannter Bucket → keine Zeilen, statt still nach Jahr zu gruppieren.
  where p_bucket in ('day', 'month', 'year')
  group by 1
  order by 1;
$$;

comment on function public.savings_by_period(date, date, text) is
  'Ersparnis und Einspeisevergütung je Tag, Monat oder Jahr (p_bucket). Siehe Migration 0005.';

revoke execute on function public.savings_by_period(date, date, text) from public, anon;
grant execute on function public.savings_by_period(date, date, text) to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- Prüfen (danach einzeln ausführen):
--
-- 1) Je Monat seit Beginn (erwartet: Zeile "2026-10" ≈ Summe der Tageswerte
--    aus daily_savings(); kein "2026-09" – sys_*-Werte erst ab 06.10.2026)
--    begin; set local role authenticated;
--    select * from public.savings_by_period('2026-09-15', current_date, 'month');
--    rollback;
--
-- 2) Je Jahr (erwartet: eine Zeile "2026")
--    begin; set local role authenticated;
--    select * from public.savings_by_period('2026-09-15', current_date, 'year');
--    rollback;
--
-- 3) Als anon (erwartet: ERROR permission denied for function savings_by_period)
--    begin; set local role anon; select * from public.savings_by_period(current_date, current_date, 'day'); rollback;
-- =============================================================================
