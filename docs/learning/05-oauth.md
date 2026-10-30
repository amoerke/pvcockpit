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

## Schritt 2 – Zustimmungsseite `/oauth/consent`

| Datei | Aufgabe |
|---|---|
| `app/oauth/consent/page.tsx` | Anfrage bei Supabase holen, Client und Rechte zeigen |
| `app/oauth/consent/actions.ts` | Server Action `decide`: erlauben oder ablehnen, zurück zum Client |
| `lib/next-path.ts` | `safeNextPath()`: Rücksprung-Ziel prüfen (Open Redirect) |
| `lib/supabase/proxy.ts`, `app/login/*` | `?next=` vom Proxy über das Login bis zur Weiterleitung |

**Die Rolle der Seite:** Supabase Auth macht Registrierung, PKCE und Tokens.
Nur die Frage „Darf dieses Programm das?“ stellt die App. Supabase leitet
dazu mit `?authorization_id=…` hierher. Drei Methoden aus `supabase-js`
genügen:

| Methode | Wofür |
|---|---|
| `auth.oauth.getAuthorizationDetails(id)` | Wer fragt (Client-Name), welche Rechte, Rücksprung-Adresse. Hat der Nutzer schon zugestimmt, kommt direkt `redirect_url`. |
| `auth.oauth.approveAuthorization(id)` | Zustimmung speichern, Code erzeugen → `redirect_url` mit `?code=…` |
| `auth.oauth.denyAuthorization(id)` | → `redirect_url` mit `?error=access_denied` |

Alle drei laufen mit dem Session-Cookie des Nutzers. Supabase prüft also
selbst, dass die Anfrage zu **diesem** Nutzer gehört.

**Server Action statt Route Handler:** Das Supabase-Beispiel nimmt einen
Route Handler für die Entscheidung. Eine Server Action ist hier besser:
Next.js prüft bei jeder Server Action den `Origin`-Header. Eine fremde
Seite kann also kein verstecktes Formular abschicken, das in deinem Namen
„Erlauben“ drückt (CSRF). Ein Route Handler müsste das selbst prüfen.

**Ein Formular, zwei Knöpfe:** Beide sind `type="submit"` mit `name="decision"`.
Der Browser schickt nur `name`/`value` des gedrückten Knopfs mit, die Action
liest `decision` und prüft es mit zod (`"approve" | "deny"`).

**`redirect()` zu einer fremden Adresse:** Am Ende leitet die Action zum
Client weiter, z. B. an `http://localhost:…/callback?code=…` bei Claude Code.
`redirect()` kann absolute URLs. Die Adresse stammt von Supabase (die beim
Registrieren hinterlegte `redirect_uri`), nicht aus dem Formular. Die Seite
zeigt sie trotzdem an: Eine unerwartete Rücksprung-Adresse ist ein
Warnzeichen.

**Rücksprung nach dem Login (`?next=`):** Wer vom Client kommt, ist oft nicht
eingeloggt. Ohne Rücksprung landete er nach dem Login im Dashboard, und die
`authorization_id` wäre verloren. Darum:

1. Der Proxy leitet nach `/login?next=/oauth/consent?authorization_id=…`.
2. Die Login-Seite gibt `next` als verstecktes Feld ans Formular.
3. Die Login-Action leitet nach Erfolg dorthin.
4. Ist man schon eingeloggt und ruft `/login?next=…` auf, springt der Proxy
   direkt zum Ziel.

**Open Redirect:** `next` kommt aus der URL, also von außen. Ungeprüft
schickt ein Link wie `/login?next=https://boese.example` den Nutzer nach dem
echten Login auf eine nachgemachte Seite. `safeNextPath()` lässt nur Pfade
der eigenen App durch. Der Trick: den Wert relativ zu einer
Platzhalter-Origin auflösen und prüfen, dass die Origin gleich bleibt.

| Eingabe | Ergebnis |
|---|---|
| `/oauth/consent?authorization_id=abc` | unverändert |
| `//boese.example` | `null` (für Browser eine andere Website) |
| `/\boese.example` | `null` (Browser lesen `\` wie `/`) |
| `https://boese.example`, `javascript:…` | `null` |

Geprüft wird **zweimal**: auf der Login-Seite (Anzeige) und in der Action.
Das versteckte Feld kommt vom Browser und lässt sich verändern.

**Route-Typen:** `PageProps<"/oauth/consent">` kannte die neue Route erst
nach `npx next typegen` (läuft sonst bei `next dev`/`next build` mit).

**Getestet** (E2E, alle 40 grün):

- Gast ruft `/oauth/consent?authorization_id=…` auf → `/login?next=…` →
  nach dem Login zurück auf der Zustimmungsseite, mit derselben ID.
- `/login?next=//boese.example/login` → nach dem Login `/dashboard`.
- Eingeloggt auf `/login?next=/dashboard/savings` → direkt dorthin.
- Unbekannte `authorization_id` → Hinweis „ungültig oder abgelaufen“.

Noch nicht getestet: die Seite mit einer echten Anfrage. Eine
`authorization_id` entsteht nur im echten Ablauf, und Supabase leitet dafür
auf `pv.dataminer.cloud` weiter (Schritt 5).
