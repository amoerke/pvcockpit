/**
 * Data Access Layer (DAL) – die VERBINDLICHE Auth-Prüfung der App.
 *
 * Der Proxy (proxy.ts) prüft nur "optimistisch" vorab. Er ist keine
 * Sicherheitsgrenze: Server Actions sind eigenständige POST-Endpunkte, und ein
 * Matcher kann Pfade auslassen. Deshalb gilt in dieser App die Regel:
 *
 *   Jede Seite, jede Server Action und jede Datenabfrage, die einen
 *   eingeloggten Nutzer voraussetzt, ruft zuerst `verifySession()` auf.
 *
 * So liegt die Prüfung direkt neben den Daten – egal, über welchen Weg der
 * Aufruf hereinkommt.
 *
 * Doku: node_modules/next/dist/docs/01-app/02-guides/authentication.md
 *       node_modules/next/dist/docs/01-app/02-guides/data-security.md
 */

// Build-Fehler, falls eine Client Component diese Datei importiert.
import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * DTO (Data Transfer Object): Nur die Felder, die die App wirklich braucht.
 *
 * Das Supabase-User-Objekt enthält viel mehr (Metadaten, Identitäten,
 * Zeitstempel …). Was wir nicht weitergeben, kann auch nicht versehentlich
 * in Props einer Client Component und damit im Browser landen.
 */
export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Prüft beim Auth-Server, ob der Request zu einem eingeloggten Nutzer gehört.
 * - Kein (gültiger) Login → Weiterleitung nach /login (Funktion kehrt nie zurück).
 * - Sonst → der Nutzer als schlankes DTO.
 *
 * `cache()` aus React merkt sich das Ergebnis für die Dauer EINES
 * Server-Requests. Rufen Layout, Seite und mehrere Komponenten
 * `verifySession()` auf, geht trotzdem nur ein Aufruf an den Auth-Server.
 * Der Cache wird pro Request neu angelegt – Nutzer teilen sich also nie
 * ein Ergebnis.
 */
export const verifySession = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();

  // getUser() statt getSession(): getSession() würde das Cookie nur auslesen,
  // ohne dessen Echtheit zu prüfen (Begründung ausführlich in
  // lib/supabase/proxy.ts).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // redirect() wirft intern eine spezielle Exception, die Next.js abfängt
    // und in eine Weiterleitung umwandelt. Code danach läuft nicht mehr –
    // TypeScript weiß das (Rückgabetyp `never`), daher ist `user` unten
    // garantiert gesetzt.
    redirect("/login");
  }

  return {
    id: user.id,
    // Bei E-Mail/Passwort-Login ist die E-Mail immer vorhanden; der Typ
    // erlaubt aber `undefined` (z. B. bei Telefon-Login), daher der Fallback.
    email: user.email ?? "",
  };
});
