# Kapitel 1 – Authentifizierung

## Schritt 1 – Umgebungsvariablen & Supabase-Konfiguration

### Wie Next.js `.env`-Dateien lädt

Next.js lädt Umgebungsvariablen automatisch aus `.env*`-Dateien im Projekt-Root.
Ist eine Variable mehrfach definiert, gewinnt die erste Fundstelle in dieser Reihenfolge:

1. `process.env` (z. B. von der Shell oder dem Hosting-Anbieter gesetzt)
2. `.env.$(NODE_ENV).local` – z. B. `.env.development.local`
3. `.env.local` – **nicht** geladen, wenn `NODE_ENV=test`
4. `.env.$(NODE_ENV)` – z. B. `.env.production`
5. `.env`

Faustregel: `.env.local` für deine lokalen Werte (nie committen), `.env.example`
als dokumentierte Vorlage (committen).

> Doku: `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`

### Server oder Browser? Das `NEXT_PUBLIC_`-Präfix

| Variable | Wo verfügbar | Wie |
|---|---|---|
| `SUPABASE_TABLE` | nur Server (Node.js) | wird zur Laufzeit aus `process.env` gelesen |
| `NEXT_PUBLIC_SUPABASE_URL` | Server **und** Browser | wird beim Build **als fester Text** ins JS-Bundle eingesetzt |

Zwei Konsequenzen, die man kennen muss:

- **Alles mit `NEXT_PUBLIC_` ist öffentlich.** Jeder kann es im Browser-DevTools
  lesen. Deshalb nur der `anon`-Key, niemals der `service_role`-Key.
- **Nur direkte Zugriffe werden ersetzt.** `process.env.NEXT_PUBLIC_SUPABASE_URL`
  funktioniert im Browser, `process.env[varName]` (dynamisch) nicht – dort ist
  der Wert `undefined`.
- Nach `next build` sind die `NEXT_PUBLIC_`-Werte eingefroren. Ändert man sie,
  muss neu gebaut werden.

### Warum der Anon-Key öffentlich sein darf

Der Anon-Key ist ein JWT mit `role: anon`. Er identifiziert nur „diese App“,
nicht einen Nutzer. Nach dem Login schickt der Supabase-Client zusätzlich das
**Access-Token des Nutzers** (JWT mit `role: authenticated` und `sub: <user-id>`).
Was mit welchem Token erlaubt ist, entscheidet Postgres über **Row Level
Security (RLS)** – das bauen wir in Meilenstein 2.

### Server-seitige Supabase-Konfiguration (Coolify)

Damit nur eingeladene Nutzer hineinkommen und Auth-Mails zur App führen:

| Variable | Wert | Zweck |
|---|---|---|
| `GOTRUE_SITE_URL` | `http://localhost:3000` | Standardziel für Links in Auth-Mails |
| `ADDITIONAL_REDIRECT_URLS` | `http://localhost:3000/**` | Erlaubte Rücksprung-URLs (Allow-List gegen Open Redirects) |
| `DISABLE_SIGNUP` | `true` | Keine Selbstregistrierung – Einladungen funktionieren trotzdem |
| `ENABLE_EMAIL_SIGNUP` | `true` | Trotz des Namens: schaltet den E-Mail-Login generell ein |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` | E-Mail-Adresse muss bestätigt werden |
| `ENABLE_PHONE_SIGNUP` / `_AUTOCONFIRM` | `false` | Nicht genutzt → aus |

Bei Deployment später: `GOTRUE_SITE_URL` und Redirect-URLs um die echte Domain ergänzen.

## Schritt 2 – Supabase-Clients für Browser und Server

Pakete (Versionen exakt gepinnt, Lockfile committet – Schutz vor Supply-Chain-Überraschungen):
`@supabase/supabase-js` und `@supabase/ssr`.

### Drei Orte, an denen Code läuft

| Ort | Beispiel | Cookies lesen | Cookies schreiben | Client |
|---|---|---|---|---|
| Browser | Client Component (`"use client"`) | ja (`document.cookie`) | ja | `lib/supabase/client.ts` |
| Server, beim Rendern | Server Component (`page.tsx`) | ja | **nein** | `lib/supabase/server.ts` |
| Server, bei Aktionen | Server Action, Route Handler, Proxy | ja | ja | `lib/supabase/server.ts` / Proxy |

Warum dürfen Server Components keine Cookies setzen? Cookies werden als
HTTP-Header (`Set-Cookie`) verschickt. Beim Rendern streamt Next.js die Seite
aber bereits zum Browser – die Header sind dann schon raus.

### Warum liegt die Session in Cookies?

Bei einer reinen Browser-App (SPA) speichert Supabase die Session im
`localStorage`. Den sieht aber nur der Browser. Damit auch der Server bei jedem
Request weiß, wer eingeloggt ist, speichert `@supabase/ssr` die Tokens in
Cookies – die schickt der Browser automatisch mit.

### Die Cookie-Schnittstelle `getAll` / `setAll`

Der Server-Client bekommt zwei Funktionen:

- `getAll()` – liefert alle Cookies des Requests. Supabase sucht sich seine
  `sb-<projekt>-auth-token`-Cookies heraus (große Tokens werden auf
  `…auth-token.0`, `….1` usw. aufgeteilt).
- `setAll(cookies, headers)` – schreibt neue Tokens. Der zweite Parameter
  enthält Cache-Header (`Cache-Control` usw.), damit ein CDN keine Antwort mit
  fremden Session-Cookies zwischenspeichert. Relevant im Proxy.

> Ältere Tutorials zeigen `get`/`set`/`remove` oder das Paket
> `@supabase/auth-helpers-nextjs` – beides ist veraltet.

### `server-only`

`import "server-only"` in `lib/supabase/server.ts` lässt den Build fehlschlagen,
sobald die Datei in eine Client Component importiert wird. Eine billige
Versicherung, dass Server-Code nie im Browser-Bundle landet.

### Ein Client pro Request

Der Server-Client wird in jeder Funktion neu erzeugt (`await createClient()`).
Ein globaler, geteilter Client wäre gefährlich: Auf dem Server laufen Requests
verschiedener Nutzer im selben Prozess – deren Sessions dürfen sich nie mischen.

## Schritt 3 – Proxy: Session erneuern und weiterleiten

> Doku: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`,
> `…/03-api-reference/03-file-conventions/proxy.md`

### Middleware heißt jetzt Proxy

Seit Next.js 16 heißt `middleware.ts` → `proxy.ts`, die exportierte Funktion
`middleware` → `proxy`. Funktional gleich, aber er läuft jetzt in der
**Node.js-Runtime** (vorher Edge). Es gibt genau eine `proxy.ts` im Projekt-Root.

### Der Ablauf eines Requests

```
Browser ──GET /dashboard──▶ proxy.ts
                              │ getUser()  ──▶ Supabase Auth: Token gültig? ggf. erneuern
                              │
                ┌─────────────┴──────────────┐
          kein User                       User ok
                │                            │
     307 Redirect → /login         NextResponse.next() + neue Cookies
                                             │
                                     app/dashboard/page.tsx rendert
```

### Warum Cookies an zwei Stellen gesetzt werden

Nach einem Token-Refresh setzt `setAll` die neuen Cookies

1. auf den **Request** – damit die Server Components *in diesem* Request schon
   das neue Token sehen,
2. auf die **Response** – damit der Browser sie speichert.

Bei einer Weiterleitung entsteht eine *neue* Response; die Cookies müssen
dorthin kopiert werden (`redirectWithCookies`). Vergisst man das, laufen
Browser- und Server-Session auseinander → scheinbar zufällige Logouts.

### `getSession()` vs. `getClaims()` vs. `getUser()`

| Methode | Prüft | Netzwerk | Auf dem Server für Auth? |
|---|---|---|---|
| `getSession()` | nichts – liest nur das Cookie | nein | **niemals** (Cookie kann gefälscht sein) |
| `getClaims()` | JWT-Signatur lokal (nur asymmetrische Keys) | nein* | ja |
| `getUser()` | fragt den Auth-Server | ja | ja |

\* Bei HS256 (gemeinsames JWT-Secret, wie bei unserer self-hosted Instanz) kann
die App die Signatur nicht selbst prüfen – `getClaims()` fällt dann auf
`getUser()` zurück. Deshalb nutzen wir direkt `getUser()`.

### Proxy = optimistische Prüfung, nicht die Sicherheitsgrenze

Die Next-Doku betont: Der Proxy ist kein vollständiger Schutz. Server Actions
sind eigene POST-Endpunkte, und ein Matcher kann Pfade auslassen. Die
verbindliche Prüfung gehört nah an die Daten → **Data Access Layer** (Schritt 4).

### Der `matcher`

Ohne Matcher läuft der Proxy bei *jedem* Request – auch für jedes Bild und JS-Bundle.
Der negative Lookahead `(?!…)` schließt statische Dateien aus.

### Getestet

| Pfad | Erwartung (ohne Login) | Ergebnis |
|---|---|---|
| `/`, `/dashboard` | 307 → `/login` | ✓ |
| `/login`, `/auth/confirm` | öffentlich (noch 404, Seiten fehlen) | ✓ |
| `/authxyz` | 307 → `/login` (nicht mit `/auth` verwechselt) | ✓ |
| `/next.svg` | 200, Proxy läuft nicht | ✓ |

## Schritt 4 – Data Access Layer (DAL)

> Doku: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
> `…/02-guides/data-security.md`

### Warum doppelt prüfen, wenn der Proxy schon prüft?

Der Proxy ist eine **Vorab-Prüfung** für gute UX (schnelle Weiterleitung).
Er ist aber keine Sicherheitsgrenze:

- **Server Actions** sind eigene POST-Endpunkte. Eine Prüfung *auf der Seite*
  schützt die Actions auf dieser Seite nicht.
- Ein **Matcher** kann Pfade auslassen – ein Tippfehler in der Regex, und eine
  Seite ist ungeschützt.
- **Defense in Depth:** Mehrere unabhängige Schichten. Fällt eine weg, hält die nächste.

Deshalb: `lib/dal.ts` ist die eine Stelle, die verbindlich sagt „dieser Request
gehört zu Nutzer X“. Alles, was Login voraussetzt, ruft zuerst `verifySession()`.
(Und in Meilenstein 2 kommt mit **RLS** in Postgres noch eine dritte Schicht dazu.)

```
Proxy (optimistisch, UX)  →  DAL verifySession() (verbindlich)  →  RLS in Postgres (Daten)
```

### React `cache()`

```ts
export const verifySession = cache(async () => { … });
```

`cache()` merkt sich das Ergebnis **für einen Server-Request**. Rufen Layout,
Seite und drei Komponenten `verifySession()` auf, geht trotzdem nur ein Aufruf
an den Auth-Server. Nach dem Request ist der Cache weg – Nutzer teilen sich nie
ein Ergebnis. (Nicht verwechseln mit `"use cache"` – das ist ein persistenter
Cache über Requests hinweg und für nutzerspezifische Daten ungeeignet.)

### DTO statt komplettem User-Objekt

`verifySession()` gibt nur `{ id, email }` zurück. Was nicht herausgegeben wird,
kann nicht versehentlich als Prop an eine Client Component und damit in den
Browser wandern.

### `redirect()` wirft

`redirect("/login")` wirft intern eine spezielle Exception, die Next.js in eine
Weiterleitung übersetzt. Der Rückgabetyp ist `never` – TypeScript weiß also,
dass `user` danach gesetzt ist. Folge für später: `redirect()` **nicht** in ein
`try/catch` packen, sonst fängt man die Weiterleitung selbst ab.

## Schritt 5 – shadcn/ui und Login mit Server Action

> Doku: `node_modules/next/dist/docs/01-app/02-guides/forms.md`,
> `…/01-getting-started/07-mutating-data.md`, `…/02-guides/server-actions.md`

### shadcn/ui

`npx shadcn@latest init` hat angelegt:

- `components.json` – Konfiguration (Stil `base-nova`, Basis-Bibliothek **Base UI**, Farben als CSS-Variablen)
- `app/globals.css` – Design-Tokens (`--background`, `--primary` …) für hell und dunkel
- `components/ui/*` – die Komponenten als **eigener Quellcode**. Kein Blackbox-Paket:
  Du kannst (und sollst) sie lesen und anpassen.
- `lib/utils.ts` – `cn()` zum Zusammenführen von Tailwind-Klassen (Paket `cn` von shadcn)

Zwei Korrekturen nach dem Init:
- **`shadcn` → `devDependencies`.** Das Paket ist ein CLI-Werkzeug; zur Laufzeit wird
  nur seine CSS-Datei beim Build importiert. Als Laufzeit-Abhängigkeit zog es
  9 `npm audit`-Warnungen (über `fast-glob` → `braces`) in die Produktions-Abhängigkeiten.
- **Schrift:** `globals.css` erwartet `--font-sans`, das Layout lieferte noch
  `--font-geist-sans` → in `app/layout.tsx` angepasst.

### Server Component + Client Component

```
app/login/
├── page.tsx         Server Component – statisches Gerüst (Card, Titel, metadata)
├── login-form.tsx   Client Component – Formular mit useActionState
├── actions.ts       "use server" – die Server Action login()
└── definitions.ts   Zod-Schema + LoginState-Typ (von beiden genutzt)
```

Faustregel: `"use client"` so tief wie möglich setzen. Nur das Formular braucht
Interaktivität im Browser, die Seite drumherum nicht.

Warum `definitions.ts`? Eine `"use server"`-Datei darf **nur async-Funktionen**
exportieren – kein Schema, keine Konstanten.

### Der Ablauf eines Logins

```
<form action={formAction}>  ──POST (FormData)──▶  login(prevState, formData)   [Server]
                                                    1. Zod: safeParse
                                                    2. signInWithPassword → setAll schreibt Cookies
                                                    3. revalidatePath + redirect("/dashboard")
       ◀── neuer State (Fehler) ODER Redirect ──────┘
useActionState rendert neu
```

### `useActionState`

```ts
const [state, formAction, pending] = useActionState(login, initialState);
```

- `state` – was die Action zuletzt zurückgegeben hat (Fehler, eingegebene E-Mail)
- `formAction` – an `<form action>`; ruft `login(state, formData)` auf
- `pending` – `true`, solange die Action läuft (Button sperren)

Weil wir `action=` statt `onSubmit` nutzen, funktioniert das Formular sogar
ohne geladenes JavaScript (**Progressive Enhancement**).

### Zod

Alles aus `FormData` ist `string | File | null` – also nicht vertrauenswürdig.
`LoginSchema.safeParse()` liefert entweder typsichere Daten oder Fehler pro Feld
(`z.flattenError(error).fieldErrors`). Zod v4: Fehlermeldungen über `{ error: "…" }`.

### Sicherheit im Detail

- **Keine User Enumeration:** Immer „E-Mail oder Passwort ist falsch“, nie
  „E-Mail unbekannt“. Den echten Fehlercode loggen wir nur serverseitig.
- **`redirect()` außerhalb von `try/catch`** – es wirft intern.
- **`revalidatePath("/", "layout")`** leert den Client-Router-Cache, damit keine
  zwischengespeicherte „ausgeloggt“-Ansicht angezeigt wird.

### Stolperstein: `defaultValue` und Base UI

Nach einem Fehler soll die E-Mail im Feld stehen bleiben → `defaultValue={state.email}`.
Ein *Default*wert darf sich aber nach dem ersten Rendern nicht ändern (Base UI
warnt). Lösung: `key={state.email}` – ändert sich der Key, legt React das Feld
neu an. Ein nützlicher React-Trick, den man öfter braucht.

### Getestet (Browser, gegen die echte Supabase-Instanz)

| Fall | Ergebnis |
|---|---|
| `/` ohne Login | → `/login` |
| Leeres Formular | Feldfehler bei E-Mail und Passwort ✓ |
| Unbekannte E-Mail / falsches Passwort | „E-Mail oder Passwort ist falsch.“, Server-Log `invalid_credentials` ✓ |
| Erfolgreicher Login | → `/dashboard` (Seite folgt in Schritt 6) |

## Schritt 6 – Geschütztes Dashboard und Logout

### Wo gehört die Auth-Prüfung hin?

| Ort | Geeignet? | Warum |
|---|---|---|
| `proxy.ts` | als Vorab-Prüfung | schnell, aber keine Sicherheitsgrenze |
| `layout.tsx` | **nein** | Layouts rendern bei Navigation zwischen Unterseiten nicht neu (*Partial Rendering*) – die Prüfung liefe nicht bei jedem Seitenwechsel |
| `page.tsx` | ja | rendert bei jedem Aufruf → `await verifySession()` |
| Server Action / Datenabfrage | ja | eigene Endpunkte → jeweils `verifySession()` |

> Doku: `authentication.md`, Abschnitt zu Layouts und Partial Rendering

### `redirect()` in einer Server Component

`app/page.tsx` rendert nichts, sondern ruft nur `redirect("/dashboard")`. Weil
`redirect()` vor dem Streamen greift, antwortet Next.js direkt mit einer
Weiterleitung.

### Logout: POST statt Link

`logout()` in `lib/actions/auth.ts` ist eine Server Action. Ein Link
`<a href="/logout">` (GET) könnte ungewollt ausgelöst werden – durch
Prefetching oder ein `<img src>` auf einer fremden Seite. Server Actions laufen
immer per POST, und Next.js prüft den `Origin`-Header (CSRF-Schutz).

`signOut({ scope: "local" })` beendet nur die Sitzung in diesem Browser
(`"global"` – der Standard – würde alle Geräte abmelden). Das Refresh-Token wird
widerrufen, die Cookies gelöscht. Ein schon ausgestelltes Access-Token bleibt
bis zu seinem Ablauf (≤ 1 h) technisch gültig – JWTs kann man nicht zurückrufen.

### Übung: Logout-Button

In `app/dashboard/page.tsx` ist eine TODO-Stelle markiert. Hinweise:

1. Ein `<form>` kann eine Server Action direkt als `action` bekommen – auch in
   einer **Server Component**, ganz ohne `"use client"` und ohne `useActionState`.
2. Der Button muss das Formular absenden (`type="submit"`).
3. Die shadcn-`Button`-Komponente hat Varianten, z. B. `variant="outline"` oder
   `"ghost"` (siehe `components/ui/button.tsx`).
4. Bonus: Ein Icon aus `lucide-react` (z. B. `LogOut`) neben dem Text.

Testen: Einloggen → Dashboard → Button → `/login`. Danach `/dashboard` direkt
aufrufen → muss wieder auf `/login` landen. In den DevTools (Application →
Cookies) sind die `sb-…-auth-token`-Cookies verschwunden.
