# Lernjournal – AmpereSolar Cockpit

Dieses Projekt ist ein Lernprojekt für Next.js 16 (App Router) mit Supabase.
Jeder Schritt ist ein eigener Git-Commit. Im Code erklären Kommentare das
**Was** und **Warum an dieser Stelle**. Hier im Journal steht das **Konzept**
dahinter.

## Stack

- Next.js 16.3 (App Router, Turbopack), React 19.2, TypeScript
- Tailwind CSS v4, shadcn/ui
- Supabase (self-hosted) für Auth und Daten, angebunden über `@supabase/ssr`

## Meilenstein 1 – Authentifizierung

Login per E-Mail und Passwort. Nutzer kommen nur per Einladung hinein.
Alles außer `/login` (und den Auth-Callbacks) ist geschützt.

| # | Schritt | Konzept |
|---|---------|---------|
| 0 | Ausgangsstand sichern, Journal anlegen | – |
| 1 | Supabase konfigurieren, Env-Variablen | `NEXT_PUBLIC_`-Präfix, `.env.local` |
| 2 | Supabase-Clients (Browser/Server) | Server- vs. Client-Code, async `cookies()` |
| 3 | `proxy.ts` | Proxy (früher Middleware), Matcher, Session-Refresh |
| 4 | Data Access Layer | `server-only`, React `cache()`, Prüfung nah an den Daten |
| 5 | shadcn/ui + Login-Seite | Server Actions, `useActionState` |
| 6 | Geschütztes Dashboard + Logout | `redirect()`, Layouts, Prüfung in Actions |
| 7 | Einladung & Passwort vergessen | Route Handler, Token-Hash-Flow, E-Mail-Vorlagen |
| 8 | E2E-Tests | Playwright |

## Meilenstein 2 – Dashboard

Schema-Dump, generierte Typen, RLS-Policies, Statistiken zu den AmpereStorage-Werten.

| # | Schritt | Konzept |
|---|---------|---------|
| 9 | Typisierte Datenbankzugriffe | Generierte Typen, `Database`-Generic |
| 10 | Lesezugriff (Migration 0001) | Rechte vs. Row Level Security, Rollen in Supabase |
| 11 | Verschachteltes Layout, Theme-Umschalter | Layouts, Client-Inseln, `next-themes` |
| 12–13 | Live-Kacheln und Energiefluss | Daten in Server Components, `error.tsx`, Zeitzonen |
| 14 | Live-Updates | Supabase Realtime, `useEffect` mit Cleanup |
| 15 | Heute-Bilanz | Energie aus Leistung × Zeit, `Promise.all` |
| 16 | Autarkie und Eigenverbrauch | Reine Funktionen, `null` statt NaN |
| 17 | Verlauf: Tagesansicht | Zustand in der URL (`?date=`), Recharts |
| 18 | `daily_energy()` (Migration 0003) | Rechnen in SQL, Rechte auf Funktionen |
| 19 | Verlauf: 7 Tage, 30 Tage, Jahr | `supabase.rpc()`, Lücken in Daten, `formatRange()` |
| 20 | Tarife und `daily_savings()` (Migration 0004) | Preise mit gültig-ab, `numeric`, `LEFT JOIN LATERAL` |
| 21 | Seite Ersparnis | Zwei Werte in der URL, Umschalter Ersparnis/Einspeisung |

Die zunächst geplante Technik-Seite entfällt zugunsten der Ersparnis-Seite.

## Meilenstein 3 – Docker

App als Container ausliefern: Multi-Stage-Dockerfile, `output: "standalone"`,
Compose. Supabase bleibt extern.

| # | Schritt | Konzept |
|---|---------|---------|
| 1 | Dockerfile, `.dockerignore`, Compose | Multi-Stage, Standalone-Output, Build-Args für `NEXT_PUBLIC_`, Nicht-Root-Nutzer |

## Kapitel

- [Kapitel 1 – Authentifizierung](01-auth.md)
- [Kapitel 2 – Dashboard](02-dashboard.md)
- [Kapitel 3 – Docker](03-docker.md)
