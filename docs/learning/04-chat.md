# Kapitel 4 – Chat mit MCP

Ziel: Fragen wie „Was war gestern mein Autarkiegrad?“ oder „Wie viel hat die
PV-Anlage gestern produziert?“ in natürlicher Sprache beantworten.

## Entscheidungen

| Thema | Entscheidung | Warum |
|---|---|---|
| Architektur | Zuerst MCP-Server, dann eigener Chat als Client | MCP lernen; die Tools lassen sich ohne UI in Claude Code testen |
| Ort des Servers | Route Handler `app/api/mcp/route.ts` im Cockpit | ein Deployment, nutzt `lib/` direkt, öffentlich erreichbar |
| Transport | Streamable HTTP, stateless | passt zu Route Handlern: jeder Request steht für sich |
| SDK | offizielles `@modelcontextprotocol/sdk` | die echten Bausteine statt eines Adapters |
| Tools | kuratiert statt Text-to-SQL | Kennzahlen wie der Autarkiegrad sind genau einmal definiert |
| Autarkiegrad | `sumEnergy()` + `toRatios()` in TypeScript | dieselbe Formel wie im Dashboard, keine Migration |
| Datum | Tools nehmen ISO-Tage; `get_current_date()` liefert „heute“ in Berlin | das Modell kennt das Datum nicht zuverlässig |
| Auth | Session-Cookie oder `Authorization: Bearer <Supabase-Token>` | RLS greift immer als eingeloggter Nutzer, nie Service-Role |
| LLM | Claude API, Modell per `ANTHROPIC_MODEL` (Standard `claude-haiku-5-5`) | reicht für solche Fragen, kostet wenig |
| Chat-Anbindung | Anthropic SDK + MCP-Client, Tool-Schleife selbst geschrieben | zeigt, was ein MCP-Client tut |
| Streaming | erst ohne, später als eigener Schritt | einfacher Einstieg |
| Verlauf | nur im React-State | Ein-Satz-Fragen brauchen keinen Verlauf |
| Limits | max. 5 Tool-Runden, `max_tokens` 1024, letzte 10 Nachrichten, Ausgabenlimit in der Console | Kosten im Griff |
| Tests | reine Funktionen, MCP Inspector, E2E gegen den Endpoint ohne LLM | deterministisch und ohne API-Kosten |

## Tools (erste Version)

| Tool | Liefert | Quelle |
|---|---|---|
| `get_current_date()` | heutiger Tag in Berlin | `berlinDay()` |
| `get_energy_summary(from, to)` | Summen, Autarkiegrad, Eigenverbrauchsquote, Tage mit Daten | `daily_energy()` + `toRatios()` |
| `get_energy_by_period(from, to, bucket)` | Werte je Tag/Monat/Jahr | `daily_energy()` |
| `get_savings(from, to)` | Ersparnis und Einspeisevergütung in € | `savings_by_period()` |
| `get_live_status()` | aktuelle Leistungen und SoC | `getLatestReading()` |
