-- =============================================================================
-- Migration 0001: Lesezugriff auf solar_readings für eingeloggte Nutzer
--
-- Ausführen: Supabase Studio → SQL Editor → gesamten Inhalt einfügen → Run.
-- Die Migration ist wiederholbar (läuft auch ein zweites Mal ohne Fehler).
--
-- Ausgangslage (geprüft am 2026-10-04):
--   - RLS ist aktiv, aber es gibt KEINE Policy → niemand außer service_role
--     sieht Zeilen. Das Dashboard und Realtime blieben leer.
--   - Der Pi schreibt mit dem service_role-Key. service_role hat das Attribut
--     BYPASSRLS und ist von allem hier NICHT betroffen.
--
-- Zwei Schutzschichten:
--   1. GRANT/REVOKE: WELCHE Operationen eine Rolle auf der Tabelle überhaupt
--      ausführen darf (SELECT, INSERT, …). Fehlt das Recht → Fehler
--      "permission denied".
--   2. RLS-Policies: WELCHE ZEILEN eine Rolle bei einer erlaubten Operation
--      sieht bzw. ändern darf. Keine passende Policy → 0 Zeilen (kein Fehler).
-- =============================================================================

begin;

-- RLS sicherheitshalber (erneut) einschalten – ist bereits aktiv, schadet nicht.
alter table public.solar_readings enable row level security;

-- -----------------------------------------------------------------------------
-- Schicht 1: Rechte auf Tabellenebene
-- -----------------------------------------------------------------------------
-- Supabase vergibt auf Tabellen in "public" standardmäßig ALLE Rechte an die
-- Rollen anon (nicht eingeloggt) und authenticated (eingeloggt). Wir schränken
-- das auf das Nötigste ein:

-- anon: gar nichts. Ohne Login gibt es im Dashboard keine Daten.
revoke all on table public.solar_readings from anon;

-- authenticated: nur lesen. Schreiben tut ausschließlich der Pi (service_role).
revoke all on table public.solar_readings from authenticated;
grant select on table public.solar_readings to authenticated;

-- -----------------------------------------------------------------------------
-- Schicht 2: Row Level Security
-- -----------------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer duerfen Messwerte lesen"
  on public.solar_readings;

-- Bewusst OHNE Eigentümer-Bedingung (kein `user_id = auth.uid()`):
-- Die Messwerte gehören zur Anlage, nicht zu einzelnen Nutzern. Alle
-- eingeladenen Nutzer sehen dieselben Daten (Entscheidung aus der Planung).
-- Sollte es je mehrere Anlagen/Haushalte geben, muss diese Policy um eine
-- Zuordnung erweitert werden.
--
-- `to authenticated` statt `using (auth.role() = 'authenticated')`:
-- auth.role() ist veraltet; der TO-Teil ist klarer und wird von Postgres
-- ausgewertet, bevor die Policy überhaupt geprüft wird.
create policy "Eingeloggte Nutzer duerfen Messwerte lesen"
  on public.solar_readings
  for select
  to authenticated
  using (true);

-- Keine Policies für INSERT/UPDATE/DELETE: Selbst wenn jemand das Recht
-- aus Schicht 1 zurückgäbe, blockierte RLS das Schreiben weiterhin.

commit;

-- =============================================================================
-- Prüfen (danach einzeln ausführen):
--
-- 1) Policies und Rechte ansehen
--    select policyname, roles, cmd from pg_policies where tablename = 'solar_readings';
--    select grantee, string_agg(privilege_type, ', ') from information_schema.role_table_grants
--      where table_name = 'solar_readings' group by grantee;
--
-- 2) Als eingeloggter Nutzer lesen (erwartet: Anzahl > 0)
--    begin; set local role authenticated; select count(*) from public.solar_readings; rollback;
--
-- 3) Als anon lesen (erwartet: ERROR permission denied for table solar_readings)
--    begin; set local role anon; select count(*) from public.solar_readings; rollback;
--
-- 4) Als eingeloggter Nutzer schreiben (erwartet: ERROR permission denied)
--    begin; set local role authenticated; delete from public.solar_readings where false; rollback;
-- =============================================================================
