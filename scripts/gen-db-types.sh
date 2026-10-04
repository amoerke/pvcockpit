#!/bin/sh
# -----------------------------------------------------------------------------
# Erzeugt lib/supabase/database.types.ts aus dem Live-Schema der Datenbank.
#
# Aufruf (Verbindungs-URL nur für diesen einen Befehl setzen, nicht speichern):
#   SUPABASE_DB_URL="postgresql://postgres:<passwort>@<host>:5432/postgres" npm run db:types
#
# Ist der Postgres-Port nicht öffentlich erreichbar, vorher einen SSH-Tunnel öffnen:
#   ssh -N -L 5432:<container-ip-oder-localhost>:5432 user@vps
# und dann als Host "localhost" verwenden.
#
# Nach jeder Schema-Änderung erneut ausführen – TypeScript zeigt dann alle
# Stellen im Code, die nicht mehr zum Schema passen.
# -----------------------------------------------------------------------------
set -eu

OUT="lib/supabase/database.types.ts"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Fehler: SUPABASE_DB_URL ist nicht gesetzt (siehe Kommentar in $0)." >&2
  exit 1
fi

# Erst in eine temporäre Datei schreiben: Schlägt der Generator fehl, bleibt
# die bisherige Typdatei unangetastet (statt leer überschrieben zu werden).
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > "$TMP"
mv "$TMP" "$OUT"
echo "Typen geschrieben: $OUT"
