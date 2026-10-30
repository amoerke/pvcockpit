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
