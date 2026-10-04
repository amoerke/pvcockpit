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
