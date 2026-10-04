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

## Meilenstein 2 – Dashboard (später)

Schema-Dump, generierte Typen, RLS-Policies, Statistiken zu den AmpereStorage-Werten.

## Kapitel

<!-- Pro Meilenstein entsteht hier ein Kapitel, z. B. 01-auth.md -->
