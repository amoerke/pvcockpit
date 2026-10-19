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
- Tagesenergien aus den `sys_*`-Minutenwerten aufsummiert (Leistung × Zeit),
  Tagesgrenzen in `Europe/Berlin`. Die SAJ-Zähler `*_today_kwh` passen nicht
  zur App (Abgleich 08.10.2026, siehe Schritt 15).

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

## Schritt 14 – Live-Updates mit Supabase Realtime

> Dateien: `app/dashboard/live-dashboard.tsx`, `supabase/migrations/0002_solar_readings_realtime.sql`
> Doku: https://supabase.com/docs/guides/realtime/postgres-changes

### Server rendert zuerst, Client übernimmt

```
page.tsx (Server)           live-dashboard.tsx ("use client")
  getLatestReading()  ──►     useState(initialReading)
  fetchedAt                   useEffect: Realtime-Abo → setReading(...)
                              rendert LiveTiles, EnergyFlow, ReadingStatus
```

- Der erste Wert kommt weiter vom Server: sofort sichtbar, kein Spinner.
- Danach ersetzt jede neue Zeile aus Realtime den State.
- `LiveTiles`, `EnergyFlow` und `ReadingStatus` blieben unverändert – als
  „neutrale“ Komponenten (nur Props) laufen sie auf Server **und** Client.
- Props von Server- an Client Components müssen serialisierbar sein
  (schlichte Objekte, Strings, Zahlen – keine Funktionen, keine `Date`).

### Datenbank: Publication

Realtime sendet nur Änderungen an Tabellen in der Publication
`supabase_realtime` (Migration 0002). Wer welche Zeile bekommt, entscheidet RLS
– dieselbe SELECT-Policy wie für normale Abfragen.

### `useEffect` mit Cleanup

Ein Abo ist ein Seiteneffekt: im Effect öffnen, in der zurückgegebenen
Cleanup-Funktion schließen (`supabase.removeChannel`). Im Dev-Modus baut React
(Strict Mode) jeden Effect einmal testweise auf und wieder ab – ohne Cleanup
gäbe es doppelte Abos. Der Uhr-Effect (`setInterval` / `clearInterval`) folgt
demselben Muster.

Ist der Effect **asynchron** (hier wegen `await setAuth()`), braucht es ein
`cancelled`-Flag: Wird abgebaut, während das `await` noch läuft, darf danach
kein Kanal mehr geöffnet werden.

### Die Uhr läuft im Browser

`ageMinutes` rechnet jetzt der Client aus `reading.timestamp` und einem
`now`-State. `now` startet mit `fetchedAt` vom Server (gleiches HTML auf
Server und Client → kein Hydration-Mismatch) und wird alle 30 s per
`setInterval` aktualisiert. `Date.now()` steht nur im Effect bzw. im
Event-Callback, nie im Render.

### Stolperstein: Realtime lief als `anon`

Symptom: Beim ersten neuen Messwert `RangeError: Invalid time value` in
`formatTime`.

Ursache: Der Kanal meldete sich sofort an. Der Login-Token wird aber erst kurz
danach (über ein Auth-Ereignis) an Realtime weitergereicht. Das Abo lief also
mit dem Anon-Key → Rolle `anon` → laut Migration 0001 kein Leserecht. Realtime
schickte deshalb Zeilen **ohne Inhalt** plus `errors: ["Error 401: Unauthorized"]`,
und `new Date(undefined)` warf.

Lösung:

- `await supabase.realtime.setAuth()` **vor** dem Abonnieren
- `payload.errors` prüfen und den alten Wert stehen lassen, statt abzustürzen

Gute Nachricht dabei: Die Rechte aus Migration 0001 haben genau das getan,
wofür sie da sind.

### Getestet

Im Browser: Indikator zeigt „Live“, Kacheln und Energiefluss aktualisieren
sich ohne Neuladen mit jedem neuen Messwert.

## Schritt 15 – Heute-Bilanz

> Dateien: `lib/time.ts`, `lib/readings/today.ts`, `lib/data/readings.ts` (`getTodayTotals`),
> `app/dashboard/today-balance.tsx`

### Summen statt Zähler

Ursprünglich kamen die Werte aus den Tageszählern `*_today_kwh` des
Wechselrichters (neuester Stand von heute = Tagesmaximum). Der Abgleich mit der
Ampere-App am 08.10.2026 zeigte aber: PV zählt dort ohne SolarMax (4,3 statt
5,5 kWh), Netzbezug, Einspeisung und Hausverbrauch weichen stark ab, und die
Bilanz (rein = raus) verfehlt das Ziel um über 8 kWh.

Deshalb summiert `toTodayTotals()` jetzt die `sys_*`-Leistungen selbst:

```
Energie [Wh] = Σ Leistung [W] × Dauer bis zur nächsten Messung [h]
```

- Vorzeichen werden in zwei Richtungen zerlegt (Netz: Bezug/Einspeisung,
  Batterie: entladen/laden) – wie beim Live-Wert.
- Lücken über 5 Minuten (Logger-Ausfall) zählen nicht mit.
- PostgREST liefert höchstens 1.000 Zeilen pro Anfrage, ein Tag hat bis zu
  1.440 – deshalb lädt `getTodayTotals()` seitenweise mit `.range()`.

### „Heute“ ist eine Zeitzonenfrage

`ts` liegt in UTC. „Heute“ beginnt um 00:00 Uhr **Berliner** Zeit – im Sommer
22:00 UTC am Vortag, im Winter 23:00 UTC. Ohne die Grenze würde kurz nach
Mitternacht der Endstand von gestern als „heute“ angezeigt.

`startOfDayBerlin(now)` bekommt „jetzt“ als Parameter (wie `minutesSince`):
rein, testbar, und `Date.now()` steht im Aufrufer (der Datenfunktion), nicht
in einer Komponente.

### Parallel laden mit `Promise.all`

```ts
const [latest, today] = await Promise.all([getLatestReading(), getTodayTotals()]);
```

Zwei `await` nacheinander wären ein **Wasserfall**: Die zweite Abfrage startet
erst, wenn die erste fertig ist. `Promise.all` startet beide sofort, die Seite
wartet nur so lange wie die langsamere. Doppelte `verifySession()`-Aufrufe
kosten dank `cache()` nichts.

### `<dl>` für Kennzahlen

Begriff (`<dt>`) und Wert (`<dd>`) gehören zusammen – eine Definitionsliste
drückt das semantisch aus, Screenreader lesen die Paare gemeinsam vor.

## Schritt 16 – Autarkie und Eigenverbrauch

> Dateien: `lib/readings/ratios.ts`, `app/dashboard/self-sufficiency.tsx`, `components/meter.tsx`

### Zwei Kennzahlen, zwei Blickrichtungen

| Kennzahl | Frage | Formel |
|---|---|---|
| **Autarkiegrad** | Wie viel meines *Verbrauchs* kam nicht aus dem Netz? | (Verbrauch − Netzbezug) / Verbrauch |
| **Eigenverbrauchsquote** | Wie viel meines *PV-Stroms* blieb im Haus? | (PV − Einspeisung) / PV |

Beispiel 14.10.2026, 18:26 Uhr: 17,4 kWh Verbrauch, 6,8 kWh Netzbezug →
**61 % autark**. 13,4 kWh PV, 0,1 kWh Einspeisung → **99 % Eigenverbrauch**.
Im Herbst ist die Eigenverbrauchsquote hoch und der Autarkiegrad niedrig. Im
Sommer ist es meist umgekehrt.

Die Batterie steht in keiner Formel: Strom, der mittags gespeichert und abends
entladen wird, ist weder Netzbezug noch Einspeisung. Er zählt deshalb bei
beiden Kennzahlen automatisch als „selbst genutzt“.

> Die Anzeige „10,5 von 17,4 kWh“ wirkt, als wäre falsch gerechnet
> (17,4 − 6,8 = 10,6). Gerechnet wird aber mit den ungerundeten Werten, und
> gerundet wird erst bei der Anzeige.

### `null` statt 0 % oder NaN

Nachts ist PV = 0, also müsste durch 0 geteilt werden (`NaN`). „0 %
Eigenverbrauch“ wäre ebenfalls falsch, denn es gab gar nichts zu verbrauchen.
`ratio()` liefert in diesem Fall `null`, und die Oberfläche zeigt „–“. Das ist
dieselbe Regel wie bei den Messwerten: Fehlt ein Wert, ist das etwas anderes
als 0.

### Reine Funktion, wiederverwendbar

`toRatios()` braucht nur Energiesummen. Für den Verlauf (Schritt 17) gilt
dieselbe Formel für 7 Tage, 30 Tage oder ein Jahr, nur mit anderen Summen.
Deshalb liegt sie in einer eigenen Datei und nicht in `today.ts`.

### Kleine Refaktorierung: `Meter`

Der Ladezustands-Balken aus den Live-Kacheln ist jetzt die gemeinsame
Komponente `components/meter.tsx` und zeigt auch die beiden Quoten an. Sie
bleibt „neutral“: Die Live-Kacheln rendern sie im Client, die neue Karte auf
dem Server.

### Getestet

- `tsc` und ESLint ohne Befund, E2E 12/12 grün
- Im Browser mit echten Daten: Werte passen zur Tagesbilanz, keine Konsolenfehler

## Schritt 17 – Verlauf: Tagesansicht

> Dateien: `app/dashboard/history/{page,day-nav,day-chart}.tsx`, `lib/readings/day.ts`,
> `lib/time.ts`, `lib/data/readings.ts` (`getDayHistory`), `components/ui/chart.tsx`
> Doku: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`,
> https://ui.shadcn.com/docs/components/chart

Der Verlauf ist auf zwei Schritte verteilt: **17** zeigt einen einzelnen Tag
mit Leistungskurve und Navigation von Tag zu Tag. **18** bringt die Zeiträume
7 T / 30 T / Jahr. Dafür müssen die Summen in der Datenbank entstehen, denn ein
Jahr hat rund 525.000 Zeilen.

### Zustand in der URL statt `useState`

```
/dashboard/history                   → heute
/dashboard/history?date=2026-10-13   → 13.10.2026
```

```tsx
export default async function HistoryPage(props: PageProps<"/dashboard/history">) {
  const { date } = await props.searchParams;   // in Next 16 ein Promise!
  const history = await getDayHistory(date);
```

- Die Pfeile sind einfache `<Link href="?date=…">`. Ein Klick löst eine
  Navigation aus, und die Server Component rendert mit dem neuen Wert. Es gibt
  keinen Client-State und keinen `useEffect`.
- Lesezeichen, Teilen und der Zurück-Knopf funktionieren deshalb ohne
  zusätzlichen Code.
- `PageProps<"/dashboard/history">` ist ein globaler Typ-Helfer, den `next dev`
  erzeugt.
- Wer `searchParams` liest, macht die Seite **dynamisch**: Sie wird bei jedem
  Aufruf neu gerendert. Das ist hier gewollt.

### URL-Werte sind Benutzereingaben

Jeder kann `?date=quatsch`, `?date=2026-02-30` oder `?date=a&date=b` eintippen
(dann kommt ein Array an). `parseDay()` prüft das Format, ob es den Tag
wirklich gibt, und ob er in der Zukunft liegt. In allen Fehlerfällen zeigt die
Seite den heutigen Tag.

Die Prüfung steckt in `getDayHistory()` und nicht in der Seite. Dafür wird
nämlich `Date.now()` gebraucht, und ESLint (`react-hooks/purity`) meldet das im
Render als Fehler, auch in einer async Server Component. Das ist derselbe
Stolperstein wie in Schritt 13.

### Ein Tag hat nicht immer 24 Stunden

`dayRangeBerlin("2026-10-25")` liefert 22:00 → 23:00 UTC, also **25 Stunden**,
weil an diesem Tag die Sommerzeit endet. Am 29.03.2026 sind es nur 23 Stunden.
`berlinMidnight()` schätzt deshalb zweimal: Der Abstand zu UTC hängt vom
Zeitpunkt selbst ab. Das alte `startOfDayBerlin()` kannte diesen Sonderfall
nicht. `dayRangeBerlin()` ersetzt es jetzt, auch für „Heute“ in der Übersicht.

Auch beim Rechnen mit Kalendertagen hilft UTC: `addDays()` rechnet mit
`Date.UTC(y, m, d + 1)`. JavaScript kümmert sich dann um Monats- und
Jahreswechsel, und es kann keine Zeitzone dazwischenfunken.

### Eine Abfrage, zwei Auswertungen

`getDayHistory()` lädt die Minutenwerte des Tages **einmal** und rechnet daraus:

- `toDayCurve()` → 288 Punkte (5-Minuten-Mittel) für das Diagramm
- `toTodayTotals()` → Tagesbilanz, daraus `toRatios()` → Autarkie/Eigenverbrauch

Das Verdichten spart Daten. Alles, was eine Server Component an eine Client
Component gibt, wird ins HTML serialisiert. 1.440 Punkte mit 4 Werten wären
mehr, als das Diagramm in Pixeln breit ist. Abschnitte ohne Messung bleiben
`null` und erscheinen als Lücke, statt einen Logger-Ausfall zu überbrücken.

`TodayBalance` und `SelfSufficiency` haben jetzt eine optionale `title`-Prop.
Damit lassen sie sich unverändert für jeden Tag verwenden.

### Recharts über shadcn Charts

`npx shadcn add chart` installiert `recharts` und `components/ui/chart.tsx`.
Das Diagramm ist eine Client Component, weil Recharts die Breite misst und auf
die Maus reagiert. Es bekommt fertige Zahlen und zeichnet nur.

- `ChartConfig` legt Bezeichnung und Farbe je Linie fest (für Hell und Dunkel
  getrennt). `ChartContainer` erzeugt daraus `--color-pv` usw.
- Die x-Achse hat `type="number"` mit `domain=[Tagesbeginn, Tagesende]`: Der
  Abstand der Punkte entspricht der Zeit, und der ganze Tag ist immer zu sehen,
  auch heute um 10 Uhr.
- Vorzeichen bleiben erhalten: Batterie und Netz schwingen um die Nulllinie.
- `itemSorter={null}` an der Legende: Recharts sortiert sonst alphabetisch
  nach `dataKey`.

### Stolperstein: Link mit Button-Optik

`<Button render={<Link />} nativeButton={false}>` rendert zwar ein `<a>`,
Base UI setzt aber `role="button"`. Screenreader sagen dann „Schaltfläche“ an,
obwohl der Klick zu einer anderen Seite führt (aufgefallen, weil Playwright
`getByRole("link")` nicht fand). Richtig ist ein echter Link mit der Optik
eines Buttons:

```tsx
<Link href="…" className={buttonVariants({ variant: "outline", size: "icon" })}>
```

### Getestet

- `tsc`, ESLint ohne Befund; E2E 14/14 grün (neu: Tag wechseln, ungültiges Datum)
- Im Browser: echte Kurve vom 13.10., Tooltip, Hell und Dunkel, keine Konsolenfehler

### Übung (optional)

Ladezustand der Batterie als zweites, kleines Diagramm unter der
Leistungskurve: `soc` in `TODAY_COLUMNS` und `TodayRow` aufnehmen, in
`toDayCurve()` mitteln, dann eine `AreaChart` mit y-Achse 0–100 %.

## Schritt 18 – Tagesenergien in der Datenbank: `daily_energy()`

> Datei: `supabase/migrations/0003_daily_energy.sql`
> Doku: https://supabase.com/docs/guides/database/functions,
> https://www.postgresql.org/docs/current/functions-window.html

### Warum nicht wieder in der App summieren?

| Zeitraum | Minutenwerte | Anfragen à 1.000 Zeilen |
|---|---|---|
| Tag | 1.440 | 2 |
| 30 Tage | 43.200 | 44 |
| Jahr | 525.600 | 526 |

Für ein Jahr müssten über eine halbe Million Zeilen durchs Netz, nur damit
die App am Ende 365 Zahlen daraus macht. Die Funktion rechnet deshalb dort, wo
die Daten liegen, und schickt eine Zeile pro Tag.

### Dieselbe Rechnung in SQL

| App (`toTodayTotals`) | SQL (`daily_energy`) |
|---|---|
| Schleife, `rows[i + 1].ts` | Fensterfunktion `lead(ts) over (order by ts)` |
| `if (dt > 5 min) continue` | `where next_ts - ts <= interval '5 minutes'` |
| `Math.max(x, 0)` | `greatest(x, 0)` |
| `startOfDay…`, `dayRangeBerlin()` | `ts at time zone 'Europe/Berlin'` |
| eine Summe für den ganzen Tag | `group by day`: eine Zeile je Tag |

Einen kleinen Unterschied gibt es: Die SQL-Funktion kennt auch die erste
Messung des Folgetags. Sie zählt deshalb das letzte Intervall vor Mitternacht
(23:59 → 00:00) mit, die App nicht. Das macht höchstens eine Minute pro Tag aus.

### Die Optionen der Funktion

| Option | Bedeutung |
|---|---|
| `language sql` | reines SQL, kein PL/pgSQL nötig |
| `stable` | liest nur. Postgres darf optimieren (Standard wäre `volatile`) |
| `security invoker` | läuft mit den Rechten des **Aufrufers**, RLS gilt |
| `set search_path = ''` | alle Namen mit Schema → nichts „unterschiebbar“ |

`security definer` liefe dagegen als Besitzer (`postgres`) und würde RLS
umgehen. Das ist nützlich für gezielte Ausnahmen, aber gefährlich, wenn man es
nicht bewusst einsetzt. Hier ist es nicht nötig: Eingeloggte dürfen die
Tabelle ohnehin lesen.

### Rechte auf Funktionen

Postgres gibt `EXECUTE` auf neue Funktionen standardmäßig an **jeden**
(`PUBLIC`). Wie bei der Tabelle in Migration 0001 ziehen wir das ein, und nur
`authenticated` darf die Funktion aufrufen. Wegen `security invoker` würde
`anon` sowieso an der Tabelle scheitern. Das ist die zweite Schicht.

### Aufruf aus der App

PostgREST stellt Funktionen unter `/rest/v1/rpc/<name>` bereit:

```ts
const { data } = await supabase.rpc("daily_energy", { p_from: "2026-10-01", p_to: "2026-10-14" });
```

Der Typ steht unter `Functions` in `database.types.ts`. Damit sind Parameter
und Rückgabe typisiert, und ein Tippfehler im Parameternamen fällt beim
Kompilieren auf.

`notify pgrst, 'reload schema'` am Ende der Migration sorgt dafür, dass
PostgREST die neue Funktion sofort kennt.

### Geprüft (14.10.2026, im SQL-Editor)

1. **Als `authenticated`:** eine Zeile je Tag. Der 13.10. ergibt 16,4 / 22,8 /
   7,0 kWh (PV / Haus / Bezug), dieselben Werte wie der Verlauf der App.
2. **Als `anon`:** `ERROR 42501: permission denied for function daily_energy`.
3. **Laufzeit für 365 Tage:** `Execution Time: 675.501 ms`

`measured_hours` macht Ausfälle sichtbar:

- 12.10.: 23,62 h, also fehlen rund 23 Minuten (Lücke > 5 min, zählt nicht).
- 14.10.: 19,23 h, weil der Tag beim Prüfen gegen 19:14 Uhr noch lief.
- Werte knapp über 24 h sind richtig: Ein Intervall zählt zu dem Tag, an dem es
  beginnt. Das letzte reicht deshalb bis zur ersten Messung nach Mitternacht.

### Bewertung der Laufzeit

Rund 0,7 s reichen für die Jahresansicht. Die Zeit wächst aber mit der
Zahl der Zeilen im Zeitraum. Wird sie zu langsam, gibt es zwei nächste Stufen:

- eine Tabelle mit **fertigen Tagessummen**, die nachts per `pg_cron`
  nachgerechnet wird. Ein Jahr sind dann nur noch 365 Zeilen.
- ein **Covering Index** auf `(ts) include (sys_*)`, damit Postgres die
  Zeilen nicht aus der Tabelle holen muss (Index-Only Scan).

## Schritt 19 – Verlauf: 7 Tage, 30 Tage, Jahr

> Dateien: `lib/readings/period.ts`, `lib/data/readings.ts` (`getPeriodHistory`),
> `app/dashboard/history/{range-nav,period-view,period-chart,chart-parts}.tsx`
> Doku: https://supabase.com/docs/reference/javascript/rpc,
> https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatRange

### Zeitraum in der URL

```
/dashboard/history                 → Tag (mit ?date=)
/dashboard/history?range=7d        → heute und die 6 Tage davor
/dashboard/history?range=30d       → letzte 30 Tage
/dashboard/history?range=year      → letzte 12 Monate, ein Balken je Monat
```

Das ist dasselbe Muster wie bei `?date=` in Schritt 17: einfache Links, keine
Client-State. Die Seite liest `range` und gibt bei einem gültigen Wert
`<PeriodView>` zurück, sonst rendert sie die Tagesansicht.

`parseRange()` prüft mit `Object.hasOwn(RANGES, value)` und nicht mit
`value in RANGES`. `in` findet auch geerbte Namen. `?range=toString` wäre
damit „gültig“, und `RANGES["toString"].bucket` ergäbe `undefined`. Ein
E2E-Test prüft genau diesen Fall.

### Eine async Server Component in der Seite

`PeriodView` ist selbst `async` und holt ihre Daten mit `getPeriodHistory()`.
Die Seite entscheidet nur, *welche* Ansicht gezeigt wird. Server Components
dürfen an jeder Stelle im Baum Daten laden, nicht nur in `page.tsx`.

### `supabase.rpc()`

```ts
const { data, error } = await supabase.rpc("daily_energy", { p_from: from, p_to: to });
```

Parameter und Rückgabe kommen aus `Functions` in `database.types.ts`. Für ein
Jahr kommen höchstens 366 Zeilen zurück. Die 1.000-Zeilen-Grenze von PostgREST
gilt auch für `rpc()`, wird hier aber nicht erreicht, deshalb ist kein
seitenweises Laden nötig.

### Lücken bleiben Lücken

`toPeriodBars()` legt zuerst für **jeden** Tag (bzw. Monat) des Zeitraums
einen Balken mit `null` an und trägt dann die Datenbankzeilen ein. Tage ohne
Zeile, also ein Ausfall oder die Zeit vor dem 06.10.2026, bleiben `null`.
Recharts zeichnet dort keinen Balken. Eine 0 würde dagegen „nichts erzeugt“
behaupten.

Im Monatsbalken macht der erste Tag mit Daten aus `null` eine Zahl
(`(bar.pv ?? 0) + row.pv_kwh`), weitere Tage addieren sich dazu.

Unter der Bilanz steht deshalb „Summe über 12 von 30 Tagen mit Messwerten“.
Die Zahl wirkt sonst kleiner als erwartet, ohne dass klar ist, warum.

### Ein Typ für alle Zeiträume: `EnergyTotals`

`TodayTotals` hatte einen Zeitstempel („Stand 18:26 Uhr“), den es für 30 Tage
nicht gibt. Deshalb gibt es jetzt zwei Typen:

```ts
type EnergyTotals = { pvKwh, loadKwh, … };              // jeder Zeitraum
type TodayTotals  = EnergyTotals & { timestamp: string }; // ein Tag
```

`toRatios()` und `SelfSufficiency` nehmen `EnergyTotals` an, und
`TodayBalance` nimmt beide Typen. `"timestamp" in totals` grenzt den Typ ein:
Nur bei Tagessummen erscheint „Stand … Uhr“. Die Formeln aus Schritt 16 gelten
damit unverändert für jeden Zeitraum.

### `Intl.DateTimeFormat.formatRange()`

```ts
formatDayRange("2026-10-11", "2026-10-17")  // "11.–17. Oktober 2026"
formatDayRange("2025-11-01", "2026-10-17")  // "1. November 2025 – 17. Oktober 2026"
```

`formatRange()` lässt weg, was sich wiederholt (Monat, Jahr). Sonst müsste
man das mit Fallunterscheidungen selbst bauen.

### Kategorie-Achse statt Zahlen-Achse

Die Tageskurve hat eine x-Achse mit `type="number"`, weil Abstand dort Zeit
bedeutet. Bei den Balken ist jeder Tag eine **Kategorie** mit gleich breitem
Platz. Passen nicht alle Beschriftungen nebeneinander, lässt Recharts einige
aus (bei 30 Tagen nur jede zweite).

Farben und Tooltip-Zeile teilen sich beide Diagramme über `chart-parts.tsx`.

### Stolperstein: `getByRole("link", { name: "Tag" })`

Playwright vergleicht `name` standardmäßig als **Teiltext**, ohne Groß- und
Kleinschreibung zu beachten. „Tag“ traf daher auch „7 Tage“ und „30 Tage“,
und der Test scheiterte an „strict mode violation: resolved to 3 elements“.
Mit `{ name: "Tag", exact: true }` ist der Locator eindeutig.

### Getestet

- `tsc`, ESLint ohne Befund; E2E 16/16 grün (neu: Zeitraum wechseln, ungültiger Zeitraum)
- Im Browser (Screenshots, Hell und Dunkel): 7 T, 30 T und Jahr mit echten
  Daten, keine Konsolenfehler. Der 13.10. ergibt 16,4 / 22,8 / 7,0 kWh, wie bei
  der Prüfung von Migration 0003.

### Übung (optional)

Zeiträume blättern: `?range=7d&date=2026-10-10` zeigt die 7 Tage **bis** zum
10.10. `rangeDays()` bekommt dann statt `today` den geprüften Tag
(`parseDay()`), und `RangeNav` bzw. ein neuer Pfeil-Navigator setzt `date`
um 7 Tage zurück.

## Schritt 20 – Tarife und Ersparnis in der Datenbank: `daily_savings()`

Datei: `supabase/migrations/0004_tariffs_daily_savings.sql`. Statt der
Technik-Seite gibt es eine Seite für die Ersparnis (Entscheidung vom
19.10.2026). Dieser Schritt legt das Fundament in der Datenbank.

### Was ist die Ersparnis?

- **Ersparnis** = Eigenverbrauch × Arbeitspreis. Eigenverbrauch ist
  Hausverbrauch − Netzbezug, also jede kWh, die nicht gekauft werden musste,
  egal ob direkt vom Dach oder aus der Batterie.
- **Einspeisevergütung** = eingespeiste kWh × 8 ct.
- Der **Arbeitspreis** muss alle Bestandteile pro kWh enthalten (Energie,
  Netzentgelt, Umlagen, Steuern, MwSt), denn jede selbst verbrauchte kWh spart
  alle. Die Zeile „Energiekosten“ allein (hier 8,62 ct) ist nur ein Teil davon.
- Der **Grundpreis** zählt nicht: Er fällt mit und ohne PV an.

### Preise mit „gültig ab“

Preise ändern sich. Eine Konstante im Code würde bei einer Preisänderung
**rückwirkend** alle alten Zeiträume mit dem neuen Preis rechnen. Deshalb hat
jede Zeile in `tariffs` ein `valid_from`. Sie gilt bis zur nächsten Zeile. Eine
Preisänderung ist eine neue Zeile, keine Änderung der alten.

`valid_from` ist der Primärschlüssel: Pro Tag kann nur ein Tarif beginnen, und
der zugehörige Index macht die Suche nach dem passenden Tarif schnell.

### `numeric` für Geld

`double precision` ist eine Gleitkommazahl: schnell, aber nicht exakt
(`0.1 + 0.2 = 0.30000000000000004`). Für Energie in kWh reicht das, für
Geldbeträge nimmt man `numeric`. Die Funktion wandelt die kWh nach `numeric`,
bevor sie mit dem Preis multipliziert. Gerundet wird erst in der Anzeige.

### `LEFT JOIN LATERAL`: der Tarif des Tages

Für jeden Tag brauchen wir „die jüngste Tarifzeile mit `valid_from` ≤ Tag“.
Eine normale Unterabfrage im `FROM` kann nicht auf Spalten der Tabelle davor
zugreifen. Mit `LATERAL` darf sie das: Sie läuft einmal pro Tag und sieht
`e.day`.

```sql
left join lateral (
  select … from public.tariffs as tr
  where tr.valid_from <= e.day
  order by tr.valid_from desc
  limit 1
) as t on true
```

`left join … on true` behält Tage, für die es keinen Tarif gibt. Die
Geldspalten sind dann `null`, und die App kann „kein Tarif hinterlegt“
anzeigen, statt still 0 € zu rechnen.

### Funktion auf Funktion

`daily_savings()` ruft `daily_energy()` auf, statt die Leistungen erneut zu
summieren. Die Rechenregel für Energie steht so weiter an **einer** Stelle.
Ändert sie sich, rechnet die Ersparnis automatisch mit.

### Erster Tarif aus den Daten

`insert … select min(ts) …` trägt den Tag der ersten Messung als `valid_from`
ein, ohne dass jemand das Datum nachschlagen muss. `on conflict do nothing`
macht die Migration wiederholbar.
