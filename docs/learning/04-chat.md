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

## Schritt 3 – Auth am Endpoint

Claude Code und der MCP Inspector haben keine Browser-Cookies. Sie weisen
sich mit `Authorization: Bearer <Access-Token>` aus. Der Endpoint muss also
zwei Wege kennen und bei Misserfolg mit **401** antworten, nicht mit einer
Weiterleitung auf `/login`.

**Drei Stellen passten nicht dazu:**

| Stelle | Problem | Lösung |
|---|---|---|
| Proxy | leitet ohne Cookie nach `/login` um (307) | `/api/*` wird nicht umgeleitet, der Route Handler prüft selbst |
| `verifySession()` | kennt nur Cookies, reagiert mit `redirect()` | neues `authenticateRequest(request)` → Client oder `null` |
| `createClient()` | baut den Client immer aus Cookies | Bearer: eigener Client mit dem Token im `Authorization`-Header |

**Den Client weiterreichen statt global zu prüfen:** Die Route prüft einmal
und gibt den Supabase-Client an `createMcpServer(supabase)` weiter. Von dort
geht er an `getDailyEnergy(supabase, …)`. Damit gilt für `lib/assistant/`
eine andere Regel als für `lib/data/`: Statt `verifySession()` aufzurufen,
bekommt jede Funktion den schon geprüften Client. Die eigentliche Grenze
bleibt **RLS**, denn PostgREST liest den Nutzer aus dem Token im Header,
egal ob es aus einem Cookie oder einem Bearer-Header stammt.

**`getUser(token)` statt nur das Token zu lesen:** Wie im Proxy fragt
`getUser()` den Auth-Server. Nur so werden abgelaufene Tokens und Sessions,
die nach dem Abmelden widerrufen wurden, abgelehnt. Das haben wir beim
Playwright-Test gesehen: Nach „Abmelden“ war das alte Cookie wertlos.

**Header vorhanden → nur der Header zählt:** Ist das Bearer-Token ungültig,
kommt eine 401, auch wenn zusätzlich ein gültiges Cookie mitgeschickt wird.
Sonst würde ein Fehler im Client unbemerkt bleiben.

**`WWW-Authenticate: Bearer`** gehört laut HTTP und MCP-Spezifikation zu jeder
401. Er sagt dem Client, welche Art von Ausweis erwartet wird. Später kann
dort auch stehen, wo es per OAuth einen Ausweis gibt.

**Und CSRF?** Die Cookie-Variante ist nicht über fremde Websites ausnutzbar:
Die Supabase-Cookies sind `SameSite=Lax`, ein POST von einer fremden Seite
schickt sie also nicht mit. Außerdem löst `Content-Type: application/json`
eine CORS-Preflight-Anfrage aus, die wir nicht erlauben.

**Getestet** mit einem Node-Skript gegen den Dev-Server. Das Token stammt aus
`e2e/.auth/user.json` und wird nie ausgegeben:

| Fall | Status |
|---|---|
| ohne Ausweis | 401 |
| `Bearer quatsch` | 401 |
| `Basic abc` | 401 |
| gültiges Bearer-Token | 200 |
| gültiges Cookie | 200 |
| `Bearer quatsch` + gültiges Cookie | 401 |
| Seite `/dashboard` ohne Login | 307 → `/login` (unverändert) |

## Schritt 4 – Restliche Tools

| Tool | Parameter | Quelle | Reine Funktion |
|---|---|---|---|
| `get_energy_by_period` | `from`, `to`, `bucket` | `daily_energy()` | `toEnergyByPeriod()` in `energy.ts` |
| `get_savings` | `from`, `to` | `savings_by_period()` | `toSavingsSummary()` in `savings.ts` |
| `get_live_status` | – | neueste Zeile, `LIVE_COLUMNS` | `toLiveStatus()` in `live.ts` |

`energy-summary.ts` heißt jetzt `energy.ts`. Summary und Buckets nutzen
dieselbe Funktion `toFigures()`, rechnen und runden also garantiert gleich.
`round()` liegt in einer eigenen Datei, weil alle drei Module es brauchen.

**Tool-Beschreibungen schreiben:** Das Modell sieht von einem Tool nur Name,
Beschreibung und Parameter-Schema. Daraus muss es ablesen:

- **Wann** es das Tool nimmt und wann ein anderes: „für Vergleiche
  stattdessen `get_energy_by_period`“, „für Fragen zu ‚jetzt‘“.
- **Was** die Felder bedeuten, vor allem Fachbegriffe: `savings_eur` sind
  gesparte Stromkosten, nicht der Ertrag.
- **Wie** es Sonderfälle deutet: `null` heißt „keine Messwerte“, und
  `days_without_tariff > 0` heißt, dass Euro fehlen.
- **Worauf** es hinweisen soll: `age_minutes` über etwa 10 Minuten bedeutet,
  dass der Logger hängt.

Faustregel: Schreib die Beschreibung so, als läse sie ein neuer Kollege, der
die App nie gesehen hat und nicht nachfragen kann.

**`data_since` in `get_current_date`:** Bei „Wie viel habe ich insgesamt
gespart?“ müsste das Modell sonst raten, wo „insgesamt“ beginnt. Ein
Stolperstein beim Test: Die älteste Zeile in `solar_readings` stammt vom
15.09., `daily_energy()` zählt aber nur Zeilen **mit** `sys_*`-Werten (ab
06.10.). `data_since` muss dieselbe Bedingung nutzen, sonst gäbe es für
„insgesamt“ wochenlang `null`. Eine Kennzahl, zwei Abfragen: Beide müssen
dieselbe Definition von „Daten vorhanden“ haben.

**Token-Budget:** `get_energy_by_period` liefert höchstens 100 Einträge. Ein
Eintrag kostet etwa 100 Tokens, 302 Tageswerte für ein Jahr wären teuer und
unübersichtlich. Die Fehlermeldung nennt gleich die Lösung („Gröberen bucket
wählen“), damit das Modell den Aufruf selbst korrigieren kann.

**Lücken zeigen:** Buckets ohne Daten erscheinen mit `days_with_data: 0` und
`null`-Werten (wie `toPeriodBars()`). Fehlte der Eintrag, könnte das Modell
annehmen, es habe ihn übersehen.

**`get_live_status`:** Die Zeit kommt als Berliner Ortszeit
(`"2026-10-29 20:29"`) statt als UTC-ISO-String, damit das Modell nicht
umrechnen muss und sich dabei vertut. Leistungen sind immer ≥ 0, die
Richtung steckt im Feldnamen. Das ist dieselbe Idee wie bei `LiveReading`.

**Getestet** per Bearer-Token über HTTP: alle fünf Tools in `tools/list`, je
ein echter Aufruf, „302 Werte sind zu viele“ und `bucket: "week"` (lehnt das
Schema ab).

## Schritt 5 – MCP Inspector und Claude Code

**Token-Skript** `scripts/mcp-token.mjs` (`npm run mcp:token`): meldet sich
per `signInWithPassword()` an und gibt das Access-Token aus. Mit `--headers`
kommt stattdessen `{"Authorization":"Bearer …"}`. Nutzer: `MCP_USER_*`, sonst
der E2E-Testnutzer. Fehlermeldungen gehen nach **stderr**, damit auf
stdout nur das Token bzw. das JSON steht.

**`.mcp.json` mit `headersHelper`:** Statt ein Token fest in die
Konfiguration zu schreiben (`--header "Authorization: Bearer eyJ…"`), nennt
`headersHelper` einen Befehl. Claude Code führt ihn vor jedem Verbinden aus
und nimmt dessen JSON-Ausgabe als Header. Das hat zwei Vorteile: In der
Datei steht kein Geheimnis, sie kann also ins Repository. Und es gibt immer
ein frisches Token, obwohl jedes nur 1 Stunde gilt.

**Freigabe nötig:** Server aus einer `.mcp.json` im Projekt startet Claude
Code erst, wenn der Nutzer sie freigegeben hat. Sonst könnte ein fremdes
Repository über `headersHelper` beliebige Befehle ausführen.

**Kompromiss:** Jeder Aufruf des Skripts legt eine neue Supabase-Session an.
Bei ein paar Verbindungen am Tag stört das nicht. Für Dauerbetrieb käme
OAuth in Frage (siehe „Später“).

**MCP Inspector** (`npx @modelcontextprotocol/inspector`): eine Weboberfläche,
die sich wie ein MCP-Client verbindet. Sie zeigt `tools/list` mit den
JSON-Schemas und erlaubt, jedes Tool mit eigenen Werten aufzurufen. Damit
sieht man, was das Modell sieht, bevor ein Modell beteiligt ist.

**Ablauf beim Fragen in Claude Code:** Claude liest die Tool-Beschreibungen,
ruft `get_current_date` auf (heute → gestern ausrechnen), dann
`get_energy_summary` mit `from = to = gestern`, und formuliert aus dem JSON
die Antwort. Unser Server rechnet, das Modell übersetzt in Sprache.

## Schritt 6 – E2E-Test des Endpoints

`e2e/mcp.api.spec.ts` prüft `/api/mcp` so, wie ein MCP-Client ihn nutzt:
JSON-RPC über HTTP, mit Bearer-Token und ohne Modell. Die Tests sind
deterministisch und kosten keine API-Tokens.

**Ohne Browser:** Statt `page` nutzen die Tests die Fixture `request`
(`APIRequestContext`). Sie schickt reine HTTP-Anfragen, die `baseURL` kommt
aus der Config. Ein eigenes Projekt `api` in `playwright.config.ts` startet
keinen Chrome und hängt nicht vom Setup ab.

**Bearer statt Cookie:** `beforeAll` meldet sich per `signInWithPassword()` an,
wie `scripts/mcp-token.mjs`. Getestet wird also der Weg von Claude Code. Der
Cookie-Weg ist mit Schritt 3 abgedeckt.

**`signOut({ scope: "local" })` im `afterAll`:** Der Standard `"global"` würde
**alle** Sessions des Testnutzers widerrufen, also auch die aus
`auth.setup.ts`. Parallel laufende Browser-Tests landeten dann plötzlich auf
`/login`. Mit `fullyParallel` läuft `beforeAll` übrigens einmal **pro
Worker**, nicht einmal pro Datei.

**Was geprüft wird:**

| Gruppe | Fälle |
|---|---|
| Auth | ohne Ausweis 401 + `WWW-Authenticate`, ungültiges Token 401, GET 405 |
| Protokoll | `initialize` (Servername, Fähigkeit `tools`), `tools/list` (fünf Tools, alle `readOnlyHint`) |
| Tools | je ein echter Aufruf, an einem festen Tag in der Vergangenheit |
| Fehler fürs Modell | Schema (`2026-02-30`), `from` nach `to`, zu viele Buckets |

**Was ein JSON-RPC-Test zeigt:** Ein Tool-Fehler ist **kein** JSON-RPC-`error`.
Er ist ein normales `result` mit `isError: true`. Der Helfer `callTool()` prüft
deshalb beides: `body.error` fehlt, `result.isError` ist gesetzt.

**`Accept`-Header:** Bei Streamable HTTP muss der Client
`application/json, text/event-stream` annehmen, auch wenn unser Server nur
JSON schickt. Fehlt das, antwortet das SDK mit 406.

**Bewusst grobe Erwartungen:** Die Tests prüfen Struktur und Bereiche
(Autarkie zwischen 0 und 100 %), keine exakten kWh. Die Formeln testen die
reinen Funktionen. Hier geht es darum, dass die Teile zusammenspielen: Auth,
Transport, Schema, Datenbank.

Ausführen: `npx playwright test --project=api`

## Schritt 7 – Chat-Backend

| Datei | Aufgabe |
|---|---|
| `lib/assistant/chat.ts` | `runChat()`: MCP-Client, Tool-Schleife mit Claude |
| `app/api/chat/route.ts` | HTTP: Auth, Eingabe prüfen, Verlauf kürzen, Fehler übersetzen |

**Was ein MCP-Client tut:** Claude kennt unseren Server nicht. Der Client
fragt ihn nach seinen Tools (`tools/list`) und gibt sie Claude als `tools`
mit. Antwortet Claude mit `stop_reason: "tool_use"`, führt der Client die
gewünschten Tools aus (`tools/call`) und schickt die Ergebnisse als
`tool_result` zurück. Das wiederholt sich, bis Claude Text schreibt. Genau
das macht Claude Code im Hintergrund, hier steht es in etwa 40 Zeilen.

**Zwei Formate, fast gleich:** MCP beschreibt ein Tool mit `inputSchema`, die
Claude API mit `input_schema`. Der Rest passt 1:1, die Beschreibungen aus
Schritt 4 kommen also unverändert beim Modell an.

**Server im selben Prozess:** Statt per HTTP an `/api/mcp` zu gehen, verbindet
`InMemoryTransport.createLinkedPair()` Client und Server direkt im Speicher.
Der Server bekommt den schon geprüften Supabase-Client des Nutzers. Es muss
also kein Token weitergereicht werden, und es gibt keinen zweiten
HTTP-Request. Dieselbe Technik haben wir in Schritt 2 zum Testen benutzt.

**Regeln der Schleife:**

- Die Antwort von Claude wird **unverändert** angehängt (`response.content`),
  auch mit Thinking-Blöcken. Haiku 5.5 denkt standardmäßig und prüft beim
  nächsten Aufruf, dass der Verlauf vor diesen Blöcken unverändert ist.
- Alle Tool-Ergebnisse einer Runde gehen in **einer** `user`-Nachricht zurück.
  Claude darf mehrere Tools auf einmal verlangen; wir führen sie parallel aus.
- Ein Tool-Fehler wird zu `is_error: true`. Claude liest den Text (z. B.
  „Gröberen bucket wählen“) und kann es noch einmal versuchen.
- Den Antworttext nach `type === "text"` suchen, nicht `content[0]` nehmen:
  Vorne können Thinking-Blöcke stehen.

**Limits:**

| Limit | Wert | Wogegen |
|---|---|---|
| Tool-Runden | 5 | Schleifen, die nie enden |
| `max_tokens` | 1024 | lange Antworten; Denken zählt mit |
| `effort` | `low` | unnötiges Nachdenken bei einfachen Fragen |
| Verlauf | letzte 10 Nachrichten | jede alte Nachricht kostet bei jeder Frage erneut |
| Nachrichtenlänge | 2000 Zeichen | riesige Eingaben |
| Ausgabenlimit | in der Claude Console | alles andere |

**Verlauf kürzen ist hier unproblematisch:** Der Browser schickt nur Text
ohne Thinking-Blöcke. Was nicht mitgeschickt wird, kann Claude auch nicht als
„verändert“ erkennen. Beginnt der gekürzte Verlauf mit einer Antwort, fällt
sie weg, denn die erste Nachricht muss vom Nutzer kommen.

**Route Handler statt Server Action:** Die Chat-Seite könnte auch eine Server
Action aufrufen. Ein Route Handler lässt sich aber ohne Browser testen (mit
Bearer-Token, wie `/api/mcp`), und Streaming braucht später ohnehin einen
`Response`-Body.

**Fehler:** Das SDK wirft typisierte Fehler. `RateLimitError` wird zu 503
(„gleich noch einmal“), jeder andere `APIError` zu 502, und das Detail landet
nur im Server-Log. Fehlt `ANTHROPIC_API_KEY`, antwortet die Route mit 503 und
einem klaren Hinweis, bevor das SDK es überhaupt versucht.

**Der Key gehört nur auf den Server:** `ANTHROPIC_API_KEY` hat kein
`NEXT_PUBLIC_`. Damit kommt er nie in das JavaScript für den Browser.
`new Anthropic()` liest ihn selbst aus der Umgebung.

**Getestet** mit einem Node-Skript per Bearer-Token: ohne Ausweis 401,
kaputtes JSON 400, leere Liste 400, letzte Nachricht vom Assistenten 400,
ohne Key 503.

Mit Key, zwei echte Fragen an `claude-haiku-5-5`:

| Frage | Tool-Aufrufe | Antwort |
|---|---|---|
| „Was war gestern mein Autarkiegrad?“ | `get_current_date` → `get_energy_summary(29.10., 29.10.)` | 39,2 % (1 − 12,71 / 20,89 kWh, stimmt) |
| „Welcher Tag der letzten 7 Tage hatte die meiste PV, und wie viel habe ich gespart?“ | `get_current_date` → `get_energy_by_period(day)` + `get_savings` | 29.10. mit 10,93 kWh; 13,91 € gesamt; Hinweis, dass heute erst 17,7 von 24 Stunden erfasst sind |

Bei der zweiten Frage hat Claude zwei Tools **in einer Runde** verlangt, und
die Schleife hat sie parallel ausgeführt. Den Hinweis auf den unvollständigen
Tag hat es aus `measured_hours` abgeleitet, wie in Schritt 1 geplant.
