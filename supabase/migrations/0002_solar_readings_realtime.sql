-- =============================================================================
-- Migration 0002: Realtime für solar_readings einschalten
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar (läuft auch ein zweites Mal ohne Fehler).
--
-- Hintergrund:
--   Supabase Realtime liest das Änderungsprotokoll von Postgres (logische
--   Replikation). Gesendet werden nur Änderungen an Tabellen, die in der
--   Publication "supabase_realtime" stehen.
--
--   Wer welche Zeile bekommt, entscheidet RLS: Realtime prüft für jeden
--   Empfänger die SELECT-Policy aus Migration 0001. Eingeloggte Nutzer
--   bekommen also neue Zeilen, anon nichts.
--
--   Wir brauchen nur INSERT-Ereignisse. Dafür reicht die Standard-
--   Einstellung "replica identity default" – erst für UPDATE/DELETE mit
--   alten Werten bräuchte man "replica identity full".
-- =============================================================================

do $$
begin
  -- Self-hosted Supabase legt die Publication normalerweise selbst an.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- "alter publication … add table" schlägt fehl, wenn die Tabelle schon
  -- drin ist – deshalb vorher prüfen (macht die Migration wiederholbar).
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'solar_readings'
  ) then
    alter publication supabase_realtime add table public.solar_readings;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Prüfung: Erwartet wird genau eine Zeile (public | solar_readings).
-- -----------------------------------------------------------------------------
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename = 'solar_readings';
