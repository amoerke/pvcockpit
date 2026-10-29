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

## Schritt 1 – Tool-Logik als reine Funktionen

`lib/assistant/energy-summary.ts` enthält alles, was `get_energy_summary`
rechnet, aber noch keinen MCP-Code. So lässt sich die Logik ohne Server,
Datenbank oder Modell prüfen.

**Ein Tool ist eine öffentliche Schnittstelle.** Seine Parameter füllt ein
Sprachmodell aus. Für den Code sind das Benutzereingaben, genau wie
`?date=` in der URL. Unterschied zu `parseDay()`: Dort fällt ein ungültiger
Wert still auf „heute“ zurück, weil ein Mensch dann einfach die Seite von
heute sieht. Ein Modell bekäme so aber still falsche Zahlen. Deshalb gibt
`checkRange()` einen **Fehlertext** zurück. Das Modell liest ihn und kann
den Aufruf korrigieren.

**Zwei Ebenen der Prüfung:**

- `DaySchema` (`z.iso.date()`) prüft **ein Feld**: das Format und ob es den
  Tag gibt. Die `.describe()`-Texte landen später im JSON-Schema des Tools,
  also bei dem, was das Modell über das Tool liest.
- `checkRange()` prüft Regeln **über mehrere Felder**: `from ≤ to`, nichts in
  der Zukunft, höchstens 1000 Tage. MCP beschreibt Parameter als einzelne
  Felder, solche Regeln passen dort nicht hinein.

**Die Antwort ist für ein Modell, nicht für einen Menschen:**

- Die Einheit steht im Feldnamen (`pv_kwh`, `autarky_percent`), sonst müsste
  das Modell raten.
- Werte werden gerundet. Mehr Nachkommastellen täuschen Genauigkeit vor und
  kosten nur Tokens.
- `null` heißt „keine Daten“, nicht 0. Dieselbe Regel gilt im Dashboard.
- Aus `days_with_data` und `measured_hours` erkennt das Modell Lücken und kann
  darauf hinweisen.

Der Autarkiegrad kommt aus `sumEnergy()` und `toRatios()`. Das ist dieselbe
Formel wie in der Kachel auf dem Dashboard, sie ist also genau einmal definiert.

**Nachtrag aus Schritt 2:** Die Grenze liegt bei 1000 statt 3660 Tagen.
`daily_energy()` liefert eine Zeile je Tag, und PostgREST gibt höchstens
1.000 Zeilen zurück. Bei längeren Zeiträumen würden Tage **still** fehlen.

## Schritt 2 – MCP-Endpoint `/api/mcp`

**MCP in drei Begriffen:**

- **Server:** bietet Fähigkeiten an. Bei uns sind das nur *Tools*. MCP kennt
  außerdem *Resources* (Daten zum Lesen) und *Prompts* (Vorlagen).
- **Client:** spricht mit dem Server, zum Beispiel Claude Code, der MCP
  Inspector oder später unser Chat-Backend. Das Modell selbst ruft nichts auf,
  es *bittet* den Client darum.
- **Protokoll:** JSON-RPC 2.0. Ein Client schickt `initialize`, dann
  `tools/list` (welche Tools gibt es?) und `tools/call` (Tool ausführen).

**Aufteilung im Code:**

| Datei | Aufgabe |
|---|---|
| `lib/assistant/energy-summary.ts` | Prüfen und Rechnen (Schritt 1), ohne MCP |
| `lib/assistant/mcp-server.ts` | `createMcpServer()`: Tools mit Beschreibung und Schema registrieren |
| `app/api/mcp/route.ts` | HTTP: Request an den Transport geben, Antwort zurück |
| `lib/data/readings.ts` | `getDailyEnergy(from, to)`: `verifySession()` und `rpc("daily_energy")` |

**Streamable HTTP, stateless:** Der Client schickt jede Nachricht als POST.
Mit `sessionIdGenerator: undefined` gibt es keine Session. Pro Request
entstehen ein neuer `McpServer` und ein neuer Transport, beide sind danach
weg. Darum genügt ein `POST`-Export. GET (Server-Push per SSE) und DELETE
(Session beenden) setzen eine Session voraus, für sie antwortet Next.js
selbst mit 405. `enableJsonResponse: true` liefert eine normale JSON-Antwort
statt eines SSE-Streams, weil unsere Tools in einem Stück antworten.

Der Transport heißt `WebStandardStreamableHTTPServerTransport`: Er nimmt einen
Web-`Request` und gibt eine `Response` zurück. Genau mit diesen Typen arbeiten
Route Handler. Die Variante ohne „WebStandard“ ist für Node/Express gebaut.

**Schema → JSON-Schema:** `inputSchema: { from: DaySchema, to: DaySchema }`
ist ein „raw shape“. Das SDK macht daraus das JSON-Schema, das in
`tools/list` steht, und prüft damit jeden Aufruf. Der Code im Tool bekommt
`from`/`to` also schon geprüft. `z.iso.date()` erzeugt dabei ein langes
Regex-`pattern`, das bei jedem `tools/list` Tokens kostet. Das ist der Preis
dafür, dass auch 2026-02-30 abgelehnt wird.

**Zwei Arten von Fehlern:**

| Fehler | Beispiel | Antwort |
|---|---|---|
| Schema verletzt | `from: "2026-02-30"` | SDK: `Input validation error …` |
| Regel verletzt | `from` nach `to` | unser Text aus `checkRange()` |

Beide kommen als Tool-Ergebnis mit `isError: true` zurück, nicht als
Protokollfehler. Das Modell liest den Text und kann den Aufruf korrigieren.

**`readOnlyHint: true`:** sagt Clients, dass das Tool nichts verändert. Claude
Code und andere Clients dürfen es dann ohne Rückfrage ausführen.

**Noch offen (Schritt 3):** Ohne Login leitet der Proxy `/api/mcp` nach
`/login` um (307). Für einen API-Client ist das die falsche Antwort, er
erwartet 401. Außerdem kennt `verifySession()` nur Cookies und reagiert mit
`redirect()`.

**Getestet** mit einem MCP-Client im selben Prozess (`InMemoryTransport`):
`tools/list`, `get_current_date` und alle drei Fehlerfälle. Dazu kam ein
`fetch()` aus der DevTools-Konsole im eingeloggten Browser. Das Cookie geht
automatisch mit, also greifen der Proxy und RLS wie im Dashboard. Für den
28.10.2026 kamen 7,3 % Autarkie heraus (1 − 20,3 / 21,9 kWh), die
Energiebilanz geht bis auf Rundung auf.
