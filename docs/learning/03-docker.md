# Kapitel 3 – Docker

Ziel: Die App als Container ausliefern, ohne Node-Entwicklungswerkzeug im
Produktions-Image. Supabase läuft weiter extern (self-hosted), es gibt nur
einen Container für die Next.js-App.

## Multi-Stage-Build

Das `Dockerfile` hat drei Stages. Jede beginnt mit `FROM` und ist ein eigenes
Zwischen-Image, nur die **letzte** wird zum fertigen Image.

| Stage | Aufgabe | Landet im Image? |
|---|---|---|
| `deps` | `npm ci` (exakt nach `package-lock.json`) | nein |
| `builder` | Quellcode kopieren, `npm run build` | nein |
| `runner` | nur `.next/standalone`, `.next/static`, `public` | **ja** |

Vorteile: Das Image enthält weder Compiler, Dev-Abhängigkeiten noch Quellcode
(hier ~340 MB statt mehrerer GB), und die `deps`-Stage bleibt im Cache, solange
sich `package.json`/`package-lock.json` nicht ändern.

## `output: "standalone"`

In `next.config.ts` gesetzt. `next build` verfolgt dann (Output File Tracing),
welche Dateien zur Laufzeit wirklich gebraucht werden, und legt sie unter
`.next/standalone` ab, samt einem eigenen `server.js`. Damit startet die App
mit `node server.js` und braucht kein `npm install` und kein `next start` mehr.

Wichtig: `public/` und `.next/static/` kopiert Next.js **nicht** dorthin, weil
sie eigentlich ein CDN ausliefern soll. Ohne CDN kopiert das Dockerfile sie von
Hand, danach serviert `server.js` sie selbst.
(Siehe `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`.)

## `NEXT_PUBLIC_` und Build-Args

`NEXT_PUBLIC_*`-Variablen werden bei `next build` **fest ins Browser-JavaScript
geschrieben** (siehe `01-app/02-guides/self-hosting.md`, Abschnitt Environment
Variables). Setzt man sie erst beim `docker run`, ist es zu spät: Das Bundle
enthält dann `undefined`.

Darum gibt es im Dockerfile `ARG` + `ENV` in der `builder`-Stage:

```dockerfile
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
```

Folgen:

- Anderer Wert = **neu bauen** (`--build`), ein Neustart reicht nicht.
- Beide Werte sind ohnehin öffentlich (URL, anon-Key). Geheimnisse gehören
  **nie** in `ARG`/`ENV`: Sie bleiben in der Image-Historie sichtbar.
- Die `E2E_*`-Variablen werden nicht gebraucht, die Tests laufen lokal.

## `.dockerignore`

Alles, was hier steht, wird gar nicht erst an den Docker-Daemon geschickt
(Build-Context). Das beschleunigt den Build und verhindert, dass Geheimnisse
ins Image geraten: vor allem `.env*` (also `.env.local`), dazu `node_modules`
und `.next` (werden im Image neu erzeugt), `.git`, Testausgaben und `docs`.

Stolperstein: `e2e/` darf **nicht** ausgeschlossen werden. `next build`
prüft auch `playwright.config.ts` mit TypeScript, und die importiert
`./e2e/helpers`. Mit ausgeschlossenem Ordner schlug der Build im Container mit
`Cannot find module './e2e/helpers'` fehl (lokal fiel es nicht auf). In das
Runner-Image gelangt `e2e/` trotzdem nicht, weil nur die Build-Ergebnisse
kopiert werden.

## Nicht-Root-Nutzer

Standardmäßig läuft ein Container-Prozess als `root`. Das Dockerfile legt
deshalb Gruppe `nodejs` und Nutzer `nextjs` (UID 1001) an und wechselt mit
`USER nextjs`. Bricht jemand aus der App aus, hat er nur diese eingeschränkten
Rechte. Die kopierten Dateien gehören ihm über `--chown`.

## `HOSTNAME` und `PORT`

`server.js` liest beide Variablen. Im Container muss `HOSTNAME=0.0.0.0` gelten:
Mit `localhost` würde der Server nur innerhalb des Containers lauschen, das
veröffentlichte Port-Mapping (`-p 3000:3000`) käme nicht durch. `PORT` ist
3000; wer ihn ändert, muss auch das Mapping anpassen.

## Bauen und starten

Direkt mit Docker (Werte aus `.env.local`, ohne sie auszugeben oder zu kopieren):

```bash
set -a; source .env.local; set +a
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t amperesolarcockpit .
docker run --rm -p 3000:3000 amperesolarcockpit
```

Oder mit Compose. Das liest standardmäßig `.env`, nicht `.env.local`, daher
`--env-file`:

```bash
docker compose --env-file .env.local up --build
```

Danach ist die App unter <http://localhost:3000> erreichbar.
`restart: unless-stopped` startet den Container nach einem Absturz oder
Neustart des Hosts wieder, außer man hat ihn selbst gestoppt.

### Getestet

- `npm run build` lokal: Standalone-Ordner mit `server.js` entsteht.
- `docker build` mit Dummy-Werten, Container gestartet: `/login` antwortet
  mit HTTP 200, Prozess läuft als `nextjs` (UID 1001), Image ca. 336 MB.
