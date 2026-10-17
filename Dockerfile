# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Multi-Stage-Build: Abhängigkeiten -> Build -> schlankes Laufzeit-Image.
# Nur die letzte Stage landet im fertigen Image, Build-Werkzeug bleibt draußen.
# -----------------------------------------------------------------------------

# --- 1. deps: Abhängigkeiten installieren ------------------------------------
FROM node:22-alpine AS deps
# libc6-compat: manche Node-Pakete mit nativen Teilen erwarten glibc (Alpine nutzt musl)
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Nur die Paketdateien kopieren: Solange sie sich nicht ändern, bleibt dieser
# Layer im Docker-Cache und `npm ci` läuft nicht bei jedem Code-Edit neu.
COPY package.json package-lock.json ./
RUN npm ci

# --- 2. builder: Next.js bauen -----------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_-Werte setzt Next.js beim Build fest ins Browser-JavaScript ein.
# Sie müssen deshalb hier als Build-Args ankommen; zur Laufzeit zu spät.
# Es sind nur öffentliche Werte (URL + anon-Key), keine Geheimnisse.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- 3. runner: nur das Nötigste zum Ausführen -------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# HOSTNAME=0.0.0.0: Der Server muss auf allen Interfaces lauschen, sonst ist er
# von außerhalb des Containers nicht erreichbar. PORT steuert den Port.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Eigener Nutzer ohne Root-Rechte: Bei einer Lücke hat ein Angreifer weniger Macht.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# standalone enthält server.js + getracte node_modules; static und public
# kopiert Next.js bewusst nicht mit, das machen wir hier von Hand.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
