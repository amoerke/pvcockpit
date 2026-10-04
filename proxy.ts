/**
 * Next.js Proxy (bis Next.js 15 hieß diese Datei `middleware.ts`).
 *
 * Konvention: genau EINE Datei `proxy.ts` im Projekt-Root (auf Höhe von `app/`).
 * Next.js ruft die exportierte Funktion `proxy` vor jedem Request auf, auf den
 * der `matcher` unten passt. Seit Next.js 16 läuft der Proxy in der
 * Node.js-Runtime (nicht mehr in der eingeschränkten Edge-Runtime).
 *
 * Die eigentliche Logik liegt in lib/supabase/proxy.ts – hier nur die
 * "Verdrahtung". So bleibt diese Datei übersichtlich, falls später weitere
 * Proxy-Aufgaben dazukommen.
 */
import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Auf alle Pfade anwenden, AUSSER:
     * - _next/static  (gebündeltes JS/CSS)
     * - _next/image   (Bildoptimierung)
     * - favicon.ico
     * - statische Dateien mit Bild-Endungen (aus /public)
     *
     * Die Klammer mit `?!` ist ein "negativer Lookahead" in einer Regex:
     * "passt auf alles, was NICHT mit einem dieser Muster beginnt".
     * Für diese Dateien braucht es keine Session – das spart unnötige
     * Aufrufe beim Auth-Server.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
