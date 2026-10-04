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

### Datenmodell `solar_readings` (geklärt)

- Ein Messwert pro Minute (Ø 60,7 s), ~1.440 Zeilen/Tag, ~400 MB/Jahr.
- Leistungen in Watt, Vorzeichen aus Sicht des Hauses:

| Feld | positiv | negativ |
|---|---|---|
| `pv_power` | Erzeugung | – |
| `battery_power` | Batterie **entlädt** (liefert ans Haus) | Batterie **lädt** |
| `grid_power` | **Netzbezug** | **Einspeisung** |
| `load_power` | Hausverbrauch | – |

- `direction_*`, `inverter_power`, `offset14_power`: ungenutzt (Vorzeichen reichen).
- `total_grid_power`: Bedeutung ungeklärt. In den Daten gilt
  `load_power = grid_power + total_grid_power` (nachts geprüft). Wird nicht
  verwendet; Verbrauch kommt direkt aus `load_power`.
- Tagesenergien aus den Wechselrichter-Zählern `*_today_kwh` (Tagesmaximum),
  Tagesgrenzen in `Europe/Berlin`.

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

### Geprüft

Alle vier Prüf-Abfragen wie erwartet: `authenticated` liest alle Zeilen, `anon`
und Schreibversuche enden mit `permission denied`.

### RLS und Realtime

Supabase Realtime prüft für jede neue Zeile, ob der Empfänger sie laut RLS
lesen dürfte. Ohne diese SELECT-Policy kämen auch über Realtime keine Daten an.

## Schritt 11 – Verschachteltes Layout und Theme-Umschalter

> Doku: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`,
> https://github.com/pacocoursey/next-themes

### Layouts verschachteln

```
app/layout.tsx                 <html>, <body>, ThemeProvider
└── app/dashboard/layout.tsx   Kopfzeile, Navigation, Theme-Umschalter, Abmelden
    ├── page.tsx               /dashboard          (verifySession)
    └── history/page.tsx       /dashboard/history  (verifySession)
```

Ein `layout.tsx` umschließt alle Seiten in seinem Ordner. Beim Wechsel
zwischen den Unterseiten rendert nur die Seite neu, das Layout bleibt stehen
(**Partial Rendering**) – schnell, aber: Das Layout ist **keine** Auth-Prüfung.
Es ruft `verifySession()` nur für die Anzeige der E-Mail; die verbindliche
Prüfung steht weiter in jeder `page.tsx`. Dank `cache()` kostet der doppelte
Aufruf nichts.

### Server-Layout mit Client-Inseln

Das Layout bleibt eine Server Component. Nur zwei kleine Teile sind Client
Components, weil sie Hooks brauchen:

| Komponente | Hook | Warum Client? |
|---|---|---|
| `DashboardNav` | `usePathname()` | aktiven Menüpunkt hervorheben – das Layout selbst bekommt Seitenwechsel nicht mit |
| `ThemeToggle` | `useTheme()` | Wahl in `localStorage` lesen/schreiben |

Der aktive Link trägt `aria-current="page"`: Screenreader sagen „aktuelle
Seite“ an, und Tailwind stylt darüber (`aria-[current=page]:bg-muted`).

### Das Theme-Problem beim Server-Rendering

Der Server kennt die Theme-Wahl nicht (sie liegt im `localStorage` des
Browsers). Naiv gebaut: Server liefert hell → Browser schaltet auf dunkel →
**sichtbares Aufblitzen**.

`next-themes` löst das mit einem kleinen Inline-Skript, das die Klasse `dark`
am `<html>` setzt, **bevor** der Browser zeichnet. Folgen:

- `<html suppressHydrationWarning>`: Das `<html>`-Element weicht absichtlich vom
  Server-HTML ab. Die Unterdrückung gilt nur für dieses eine Element.
  Anderswo wäre sie ein Warnsignal.
- Im Umschalter hängt nichts Sichtbares direkt von `theme` ab (auf dem Server
  `undefined`). Sonne/Mond stehen beide im HTML, CSS blendet eines aus
  (`dark:hidden` / `hidden dark:block`).
- `ThemeProvider` liegt in einer eigenen `"use client"`-Datei. Eine Client
  Component darf Server Components als `children` bekommen – die Seiten
  bleiben Server Components.

### Base UI: `render` statt `asChild`

```tsx
<DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
```

Unsere shadcn-Variante baut auf Base UI (nicht Radix). Statt `asChild` gibt
man das Element an, als das gerendert werden soll.

### Getestet

- E2E: 12/12 grün (neu: Navigation inkl. `aria-current`, Theme-Wechsel bleibt nach Reload)
- Browser-Konsole in Hell und Dunkel: keine Hydration-Warnungen
