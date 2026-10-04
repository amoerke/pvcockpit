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
