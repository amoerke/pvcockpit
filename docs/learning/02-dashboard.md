# Kapitel 2 – Dashboard

## Entscheidungen (Planung)

| Thema | Entscheidung |
|---|---|
| Inhalte v1 | Live-Status (Energiefluss), Heute-Bilanz, Verläufe, Autarkie & Eigenverbrauch |
| Später | PV-Strings & Batterietemperatur (`/dashboard/technik`), danach Euro-Werte |
| Zeiträume | Heute / 7 T / 30 T / Jahr + Tag-für-Tag-Navigation, Zustand in der URL |
| Live | Supabase Realtime für die Live-Kacheln, Verläufe laden normal |
| Diagramme | shadcn Charts (Recharts) |
| Seiten | `/dashboard` (Übersicht) + `/dashboard/history`, gemeinsames `layout.tsx` |
| Theme | Umschalter Hell/Dunkel/System mit `next-themes` |
| Tabelle | `solar_readings`, Name fest im Code (Typsicherheit) |

### Offene Punkte außerhalb dieses Projekts

- **Pi-Service mit `service_role`-Key absichern:** Der Schlüssel darf *alles*
  (umgeht RLS, kann Nutzer anlegen, Tabellen löschen). Besser: eigener
  Postgres-Nutzer mit nur `INSERT` auf `solar_readings`.

## Schritt 9 – Typisierte Datenbankzugriffe

### Warum Typen für die Datenbank?

```ts
const { data } = await supabase.from("solar_readings").select("ts, soc");
data[0].soc   // number | null  – TypeScript kennt den Typ
data[0].socc  // Fehler beim Kompilieren – Tippfehler sofort sichtbar
```

Der Supabase-Client bekommt den Typ `Database` als Generic
(`createServerClient<Database>(…)`). Daraus leitet er für jede Abfrage – sogar
für den `select`-String – den Rückgabetyp ab.

`lib/supabase/database.types.ts` hat dieselbe Struktur, die `supabase gen types`
erzeugt: pro Tabelle `Row` (lesen), `Insert` (Pflichtfelder ohne `?`) und
`Update` (alles optional). `id?: never` heißt: `GENERATED ALWAYS` – darf beim
Einfügen nicht gesetzt werden.

### Generieren statt abtippen

```bash
SUPABASE_DB_URL="postgresql://postgres:…@host:5432/postgres" npm run db:types
```

`scripts/gen-db-types.sh` schreibt erst in eine temporäre Datei und ersetzt die
Typdatei nur bei Erfolg. Die Verbindungs-URL wird nur für diesen einen Befehl
gesetzt und nirgends gespeichert.

### Warum `SUPABASE_TABLE` entfernt wurde

`from(process.env.SUPABASE_TABLE)` wäre für TypeScript nur „irgendein String“
→ keine Spaltentypen mehr. Der Tabellenname steht deshalb als fester Text im Code.

## Schritt 10 – Lesezugriff: Rechte und Row Level Security

> Datei: `supabase/migrations/0001_solar_readings_read_access.sql`
> Doku: https://supabase.com/docs/guides/database/postgres/row-level-security

### Ausgangslage

RLS war aktiv, aber **ohne eine einzige Policy**. Postgres verweigert dann
alles („default deny“): Eingeloggte Nutzer hätten 0 Zeilen gesehen – ohne
Fehlermeldung. Nur der Pi konnte schreiben, weil `service_role` das Attribut
`BYPASSRLS` hat.

### Zwei Schichten

| Schicht | Frage | Fehlt die Erlaubnis … |
|---|---|---|
| `GRANT` / `REVOKE` | *Welche Operation* darf eine Rolle auf der Tabelle ausführen? | Fehler `permission denied` |
| RLS-Policy | *Welche Zeilen* sieht/ändert sie dabei? | 0 Zeilen, kein Fehler |

Supabase gibt `anon` und `authenticated` auf neuen Tabellen in `public`
zunächst **alle** Rechte – die eigentliche Absicherung übernimmt dann RLS.
Wir ziehen zusätzlich die Rechte ein (Defense in Depth):

- `anon` → nichts
- `authenticated` → nur `SELECT`
- `service_role` (Pi) → unverändert, umgeht RLS

### Die Rollen in Supabase

| Rolle | Wer | Woher |
|---|---|---|
| `anon` | Anfragen nur mit Anon-Key, ohne Login | JWT mit `role: anon` |
| `authenticated` | eingeloggte Nutzer | Access-Token nach dem Login |
| `service_role` | Server/Dienste mit dem Service-Key (Pi) | umgeht RLS |
| `postgres` | Studio-SQL-Editor, Migrationen | Tabellenbesitzer |

PostgREST schaltet für jede Anfrage per `set role` auf die Rolle aus dem JWT
um. Genau das simulieren die Prüf-Abfragen am Ende der Migration mit
`set local role authenticated` innerhalb einer Transaktion.

### `using (true)` – bewusst ohne Eigentümer-Bedingung

Typisch ist `using (user_id = auth.uid())`: Jeder sieht nur seine Zeilen.
Hier gehören die Messwerte zur Anlage, nicht zu einem Nutzer – alle
Eingeladenen sehen dasselbe. Das ist eine **bewusste** Entscheidung und steht
so im Kommentar der Policy, damit es niemand für ein Versehen hält.

### RLS und Realtime

Supabase Realtime prüft für jede neue Zeile, ob der Empfänger sie laut RLS
lesen dürfte. Ohne diese SELECT-Policy kämen auch über Realtime keine Daten an.
