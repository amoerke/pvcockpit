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

**Seit 06.10.2026 kommen die Livewerte aus den `sys_*`-Spalten** (Registerblock
0x4200). Sie zeigen dieselben Werte wie die Ampere Home App, und die Bilanz geht
auf (Abgleich am 06.10.2026: PV 1878 W = Batterie 1316 W + Haus 537 W + Netz 24 W).

| Feld | positiv | negativ |
|---|---|---|
| `sys_pv_power` | Erzeugung **inkl. SolarMax** | nachts wenige W Standby → als 0 angezeigt |
| `sys_battery_power` | Batterie **entlädt** (liefert ans Haus) | Batterie **lädt** |
| `sys_grid_power` | **Netzbezug** | **Einspeisung** |
| `sys_house_power` | Hausverbrauch | – |

Ältere Zeilen (ohne `sys_*`) rechnet `toLiveReading()` als Rückfall um:

- PV = `pv_power` (nur die zwei Stränge am Speicher) + `offset14_power`
  (Register 0x40A3 „CT PV Power“ = der SolarMax 4600SP über Stromwandler).
- Haus = PV + `battery_power` + `grid_power` aus der Bilanz.
- `load_power` (0x40A0) wird **nicht** verwendet: Das Register liegt
  systematisch zu hoch (abends beim Entladen oft 300 W und mehr). In den Daten
  gilt exakt `load_power = |CT-Netz + total_grid_power|`.
- `direction_*`, `inverter_power`: ungenutzt (Vorzeichen reichen).
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

## Schritt 12 + 13 – Erste echte Daten: Live-Kacheln und Energiefluss

### Aufteilung der Dateien

```
lib/readings/live.ts     reine Logik: Spalten, Typ LiveReading, toLiveReading(), minutesSince()
                         → KEIN server-only: wird ab Schritt 14 auch im Browser genutzt
lib/data/readings.ts     DAL: getLatestReading() – server-only, verifySession(), Abfrage, DTO
lib/format.ts            Intl-Formatierung: "2,4 kW", "21 %", "22:12" (Europe/Berlin)
app/dashboard/
├── page.tsx             async Server Component: Daten holen, leerer Zustand
├── live-tiles.tsx       4 Kacheln          ┐ "neutrale" Komponenten: nur Props,
├── energy-flow.tsx      Energiefluss       │ keine Hooks → laufen auf Server
├── reading-status.tsx   "Stand: …"         ┘ UND im Browser
└── error.tsx            Fehlerseite (Client Component, retry())
```

### Daten holen in einer Server Component

```tsx
export default async function DashboardPage() {
  const latest = await getLatestReading();
  …
}
```

Kein `useEffect`, kein Lade-Spinner, keine API-Route: Die Komponente ist
`async`, wartet auf die Daten, und der Browser bekommt fertiges HTML.

### Vorzeichen an EINER Stelle übersetzen

`toLiveReading()` macht aus `battery_power = -2300` die eindeutigen Felder
`batteryChargeW = 2300`, `batteryDischargeW = 0`. Die Komponenten müssen die
Vorzeichen-Konvention nicht kennen. `null` bleibt `null` und wird als „–“
angezeigt – ein fehlender Messwert ist etwas anderes als 0 W.

### Nur die nötigen Spalten

`LIVE_COLUMNS` lädt 10 von rund 40 Spalten (sys_* plus Rückfallspalten) – die großen `raw_*`-JSON-Felder nicht.
Der Typ `LiveRow` ist per `Pick<…>` aus denselben Spalten abgeleitet, damit
Abfrage und Typ zusammenpassen.

### Reinheit: `Date.now()` nicht im Render

ESLint (React-Compiler-Regeln) meldete `Date.now()` in der Seite als Fehler:
Komponenten sollen beim Rendern **rein** sein – gleiche Eingabe, gleiche
Ausgabe. `Date.now()` liefert bei jedem Aufruf etwas anderes. Lösung: Das Alter
berechnet die Datenfunktion (`getLatestReading` → `ageMinutes`), nicht die Komponente.

### Zeitzonen

`Intl.DateTimeFormat` ohne `timeZone` nutzt die Zeitzone des Rechners. Auf
einem Server ist das oft UTC → „20:12“ statt „22:12“. Deshalb immer
`timeZone: "Europe/Berlin"` angeben.

### `error.tsx`

Wirft eine Seite beim Rendern (z. B. Datenbank nicht erreichbar), zeigt
Next.js `error.tsx` – Layout und Navigation bleiben stehen. `retry()` lädt neu.
In Produktion sieht der Browser nur einen `digest`, nie die interne Meldung.

> In dieser Next-Version heißt die Prop `retry` (laut `node_modules/next/dist/docs`);
> ältere Tutorials zeigen `reset`.

### Stolperstein: CSS-Grid Auto-Placement

Das Energiefluss-Schema war zuerst verrutscht: Elemente mit nur `col-start-3`
(ohne Zeile) schiebt CSS-Grid in die nächste freie Zelle. Lösung: jedem
Element feste `col-start-*` **und** `row-start-*` geben.

### Barrierefreiheit nebenbei

- `role="meter"` + `aria-valuenow` am Ladezustands-Balken
- `role="status"` an „Stand: …“ (wird ab Schritt 14 bei Updates angesagt)
- `tabular-nums`: gleich breite Ziffern, Zahlen springen nicht

### Beobachtung

Mit den alten Spalten ging die Leistungsbilanz nicht auf (Beispiel: PV 2,2 kW +
Netz 15 W ≠ Batterie 2,3 kW + Haus 253 W). Ursache war zum einen der fehlende
SolarMax in `pv_power`, zum anderen das zu hohe `load_power`. Mit den
`sys_*`-Spalten ist das behoben.
