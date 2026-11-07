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
| 22 | „Alles“ (Migration 0005) | Bucket nach Laufzeit, Gruppieren in SQL, 1.000-Zeilen-Grenze |

Die zunächst geplante Technik-Seite entfällt zugunsten der Ersparnis-Seite.

## Meilenstein 3 – Docker

App als Container ausliefern: Multi-Stage-Dockerfile, `output: "standalone"`,
Compose. Supabase bleibt extern.

| # | Schritt | Konzept |
|---|---------|---------|
| 1 | Dockerfile, `.dockerignore`, Compose | Multi-Stage, Standalone-Output, Build-Args für `NEXT_PUBLIC_`, Nicht-Root-Nutzer |

## Meilenstein 4 – Chat mit MCP

Fragen in natürlicher Sprache („Was war gestern mein Autarkiegrad?“). Ein
MCP-Server im Cockpit stellt kuratierte Tools bereit; zuerst nutzt ihn
Claude Code, danach ein eigener Chat im Dashboard.

| # | Schritt | Konzept |
|---|---------|---------|
| 0 | Plan und Entscheidungen festhalten | – |
| 1 | Tool-Logik als reine Funktionen | Eingaben prüfen mit zod, Kennzahlen nur einmal definiert |
| 2 | MCP-Endpoint `/api/mcp` mit `get_current_date` und `get_energy_summary` | MCP-Grundbegriffe, Streamable HTTP, stateless, Route Handler |
| 3 | Auth am Endpoint: Cookie oder Bearer-Token | RLS mit fremdem Token, Proxy-Matcher für `/api` |
| 4 | Restliche Tools: `get_energy_by_period`, `get_savings`, `get_live_status` | Tool-Beschreibungen fürs Modell schreiben |
| 5 | Test mit MCP Inspector und Claude Code | Token-Skript, `claude mcp add --transport http` |
| 6 | E2E-Test des Endpoints | JSON-RPC direkt, ohne LLM |
| 7 | Chat-Backend | Anthropic SDK, MCP-Client, eigene Tool-Schleife, Limits |
| 8 | Chat-Seite `/dashboard/chat` | Beispielfragen, Anzeige der Tool-Aufrufe |
| 9 | API-Key im Container | Laufzeit-Variable statt Build-Arg |

Später, als eigene Schritte: Streaming, gespeicherter Verlauf. OAuth ist
Meilenstein 5.

## Meilenstein 5 – OAuth für MCP

Claude Desktop, claude.ai und Claude Code melden sich per OAuth an statt mit
dem Token-Skript. Supabase Auth stellt die Tokens aus, die App liefert die
Zustimmungsseite.

| # | Schritt | Konzept |
|---|---------|---------|
| 0 | Plan, Entscheidungen, Supabase-Update auf v2.186.0 | – |
| 1 | `/.well-known/oauth-protected-resource`, `resource_metadata` im 401 | Discovery (RFC 9728) |
| 2 | Zustimmungsseite `/oauth/consent` | Autorisierungsablauf, Server Action |
| 3 | Herkunft der Tokens: `client_id`, Log je Aufruf | Resource Indicators (RFC 8707) und ihre Grenzen bei Supabase |
| 4 | Supabase auf dem VPS fertig einrichten, App deployen | `issuer`, dynamische Registrierung |
| 5 | Test mit MCP Inspector, Claude Code, claude.ai | Ablauf aus Sicht des Clients |
| 6 | Freigaben anzeigen und widerrufen | Grants |

## Kapitel

- [Kapitel 1 – Authentifizierung](01-auth.md)
- [Kapitel 2 – Dashboard](02-dashboard.md)
- [Kapitel 3 – Docker](03-docker.md)
- [Kapitel 4 – Chat mit MCP](04-chat.md)
- [Kapitel 5 – OAuth für MCP](05-oauth.md)
- [Kapitel 6 – Installierbare Web-App](06-pwa.md)
