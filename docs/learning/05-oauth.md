# Kapitel 5 – OAuth für MCP

Ziel: Claude Desktop, claude.ai und Claude Code verbinden sich mit
`https://pv.dataminer.cloud/api/mcp`, **ohne** Token-Skript. Der Client
schickt den Nutzer zum Anmelden in den Browser und bekommt danach ein
eigenes Token, das er selbst erneuert.

## Warum OAuth?

Bisher holt `scripts/mcp-token.mjs` ein Token mit E-Mail und Passwort, und
Claude Code ruft es über den `headersHelper` in `.mcp.json` auf. Das hat drei
Grenzen:

- Claude Desktop und claude.ai können keine lokalen Skripte ausführen.
- Das Passwort steht in `.env.local` auf dem Rechner des Clients.
- Jeder Aufruf legt eine neue Supabase-Session an.

Mit OAuth gibt der Nutzer sein Passwort nur auf unserer eigenen Seite ein.
Der Client sieht es nie, er bekommt nur ein Token. Das kann man jederzeit
widerrufen.

## Rollen

| Rolle | Bei uns |
|---|---|
| Resource Server (schützt die Daten) | `/api/mcp` in der App |
| Authorization Server (meldet an, stellt Tokens aus) | Supabase Auth |
| Client | Claude Code, Claude Desktop, claude.ai, MCP Inspector |

## Ablauf

```
Client                    /api/mcp                  Supabase Auth           Browser
  │ 1. POST ohne Token ──────►│                          │                     │
  │◄── 401 + WWW-Authenticate: resource_metadata="…/.well-known/oauth-protected-resource"
  │ 2. Protected Resource Metadata ──►│                  │                     │
  │◄── { authorization_servers: [".../auth/v1"] }        │                     │
  │ 3. Authorization Server Metadata ───────────────────►│                     │
  │ 4. Client registrieren (dynamisch) ─────────────────►│                     │
  │ 5. Browser: /oauth/authorize + PKCE ─────────────────►│── Redirect ────────►│
  │                           │        /oauth/consent in der App: Login, Zustimmung
  │◄──────────────────── Redirect mit ?code=… ──────────────────────────────────│
  │ 6. code + code_verifier → Token ────────────────────►│                     │
  │ 7. POST /api/mcp mit Bearer-Token ►│ getUser(), RLS wie bisher             │
```

- **PKCE:** Der Client schickt beim Start nur den Hash eines Geheimnisses mit
  (`code_challenge`). Beim Tausch muss er das Geheimnis selbst vorlegen
  (`code_verifier`). Ein abgefangener Code nützt also niemandem.
- **Refresh-Token:** Der Client erneuert abgelaufene Access-Tokens selbst.
  Das ersetzt den `headersHelper`.

## Entscheidungen

| Thema | Entscheidung | Warum |
|---|---|---|
| Authorization Server | Supabase Auth (OAuth-2.1-Server) | keinen eigenen Auth-Server schreiben; Nutzer und Sessions liegen ohnehin dort |
| Client-Registrierung | dynamisch (RFC 7591) | MCP-Clients registrieren sich selbst, sie sind vorher nicht bekannt |
| Zustimmung | eigene Seite `/oauth/consent` in der App | Supabase leitet dorthin weiter; Login und Aussehen bleiben in der App |
| Tokens | Supabase-JWTs (`sub`, `role`, zusätzlich `client_id`) | `authenticateRequest()` und RLS bleiben unverändert |
| Token-Skript | bleibt für lokale Tests | kein Browser nötig, z. B. für E2E-Tests |
| Rechte | nur lesen | alle Tools sind `readOnlyHint`, RLS erlaubt nur Lesen |

## Stand Supabase (30.10.2026)

- Auth auf dem VPS von v2.174.0 auf **v2.186.0** aktualisiert. In v2.174.0
  gab es den OAuth-Server noch nicht.
- `GOTRUE_OAUTH_SERVER_ENABLED=true` ist gesetzt.
  `/auth/v1/.well-known/oauth-authorization-server` antwortet mit 200
  (Authorization Code, Refresh-Token, PKCE `S256`).
- Dynamische Registrierung ist noch **aus** (403). Sie wird erst
  eingeschaltet, wenn die Zustimmungsseite deployt ist.
- Login per E-Mail und Passwort funktioniert nach dem Update unverändert.

**Stolperstein beim Prüfen:** Supabase Auth hängt die OAuth-Routen nur ein,
wenn der Schalter gesetzt ist. Ein 404 hieß also zuerst nur „nicht
eingeschaltet“, nicht „gibt es nicht“. Erst mit gesetztem Schalter war
klar, dass v2.174.0 die Funktion fehlt.

**Noch offen:** In den Metadaten ist `issuer` leer, und alle Adressen sind
relativ (`"/oauth/authorize"`). MCP-Clients brauchen absolute Adressen und
einen passenden `issuer`. Vermutlich fehlt `GOTRUE_JWT_ISSUER` beim
Auth-Container. Das wird vor dem Einschalten geprüft, denn derselbe Wert
landet als `iss` in jedem neuen Token.

## Plan

| # | Schritt | Konzept |
|---|---|---|
| 0 | Plan und Entscheidungen festhalten | – |
| 1 | `/.well-known/oauth-protected-resource` und `resource_metadata` im 401 | Discovery (RFC 9728), Route Handler unter `.well-known` |
| 2 | Zustimmungsseite `/oauth/consent` mit Entscheidung | Autorisierungsablauf, Rücksprung nach dem Login, Server Action |
| 3 | Tokens prüfen: Audience und `client_id` | Warum ein Token für **diesen** Dienst ausgestellt sein muss (RFC 8707) |
| 4 | Supabase auf dem VPS fertig einrichten, App deployen | `issuer`, Authorization-Pfad, dynamische Registrierung |
| 5 | Testen: MCP Inspector, Claude Code (`/mcp`), claude.ai | Ablauf aus Sicht des Clients |
| 6 | Freigaben anzeigen und widerrufen | Grants, `client_id` in der Session |

**Testen vor dem Deployment:** Supabase leitet zur Zustimmung immer auf
Site-URL + Authorization-Pfad weiter, also auf `pv.dataminer.cloud`. Die
Schritte 1–3 testen wir deshalb lokal ohne echten Client (reine Funktionen,
`curl`, Playwright). Den ganzen Ablauf testen wir erst nach dem Deployment
in Schritt 5.

## Schritt 1 – Discovery

| Datei | Aufgabe |
|---|---|
| `lib/assistant/oauth.ts` | Metadaten bauen, `WWW-Authenticate`-Wert, öffentliche Adresse |
| `app/.well-known/oauth-protected-resource/api/mcp/route.ts` | Metadaten für `/api/mcp` (die Adresse aus dem 401) |
| `app/.well-known/oauth-protected-resource/route.ts` | dieselben Metadaten ohne Pfad (Rückfall für Clients) |
| `app/api/mcp/route.ts` | 401 mit `resource_metadata="…"` |
| `proxy.ts` | lässt `/.well-known/*` aus |

**Der 401 als Wegweiser:**

```
WWW-Authenticate: Bearer realm="amperesolarcockpit",
  resource_metadata="https://pv.dataminer.cloud/.well-known/oauth-protected-resource/api/mcp"
```

Der Client folgt der Adresse und findet:

```json
{
  "resource": "https://pv.dataminer.cloud/api/mcp",
  "authorization_servers": ["https://<supabase>/auth/v1"],
  "bearer_methods_supported": ["header"],
  "resource_name": "AmpereSolar Cockpit"
}
```

- `resource` muss **exakt** die Adresse sein, die der Client aufruft. Er
  vergleicht das und bindet später sein Token daran (Schritt 3).
- `authorization_servers` nennt den **issuer** von Supabase Auth. Dort sucht
  der Client die Login- und Token-Adressen. Deshalb muss der leere `issuer`
  aus Schritt 0 in Schritt 4 auf genau diesen Wert gesetzt werden.

**Zwei Adressen:** Die MCP-Spezifikation lässt Clients der Reihe nach
probieren: erst die Adresse aus dem 401, dann das Well-Known-Präfix **mit**
dem Pfad der Ressource (`…/oauth-protected-resource/api/mcp`), dann ohne
Pfad. Wir bedienen beide, die zweite exportiert einfach den Handler der
ersten weiter.

**`.well-known` als Ordner:** Next.js behandelt `app/.well-known/` wie jeden
anderen Ordner. Ein Punkt am Anfang macht ihn nicht privat, das tut nur ein
Unterstrich (`_ordner`).

**Proxy:** Ohne Änderung hätte der Proxy `/.well-known/*` für Gäste nach
`/login` umgeleitet. Ein Client, der die Metadaten sucht, ist aber per
Definition noch nicht angemeldet. Statt den Pfad als öffentlich zu
markieren, lässt der `matcher` ihn ganz aus. Für öffentliche Metadaten
braucht es keine Session und keinen Aufruf beim Auth-Server.

**CORS:** Browser-Clients wie der MCP Inspector lesen die Metadaten mit
`fetch()` von einer fremden Origin. Deshalb `Access-Control-Allow-Origin: *`
und ein `OPTIONS`-Handler für die Preflight-Anfrage. Die Daten sind
öffentlich, `*` verrät also nichts.

**Stolperstein `APP_URL`:** Woher kennt die App ihre öffentliche Adresse? Im
Container ergab `new URL(request.url).origin` immer `http://0.0.0.0:3000`,
auch mit `Host`- und `X-Forwarded-*`-Headern. Der Standalone-Server setzt
die Adresse aus `HOSTNAME` und `PORT` zusammen. Darum gibt es `APP_URL` als
Laufzeit-Variable (wie den API-Key in Kapitel 4). Lokal bleibt sie leer,
dann gilt die Request-Adresse `http://localhost:3000`.

| Test im Container | `resource` |
|---|---|
| ohne Proxy-Header | `http://0.0.0.0:3000/api/mcp` |
| mit `Host` + `X-Forwarded-Proto/-Host` | `https://0.0.0.0:3000/api/mcp` |
| mit `APP_URL=https://pv.dataminer.cloud` | `https://pv.dataminer.cloud/api/mcp` |

**Getestet:** zwei neue E2E-Tests im Projekt `api`. Sie folgen dem Hinweis
aus dem 401 ohne Login: Status 200, CORS-Header, `resource` und
`authorization_servers`. Dazu die Adresse ohne Pfad. Alle 36 Tests grün.
