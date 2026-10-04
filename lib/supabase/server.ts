/**
 * Supabase-Client für den SERVER: Server Components, Server Actions und
 * Route Handler.
 *
 * Die Session (Access- und Refresh-Token) liegt in Cookies. Auf dem Server
 * gibt es kein `document.cookie` – stattdessen reichen wir dem Client zwei
 * Funktionen, mit denen er über Next.js' `cookies()` lesen (`getAll`) und
 * schreiben (`setAll`) kann.
 *
 * Pro Request einen NEUEN Client erzeugen – niemals einen globalen Client
 * teilen. Sonst könnten sich Sessions verschiedener Nutzer vermischen.
 */

// Bricht den Build ab, falls diese Datei versehentlich in eine Client Component
// importiert wird. So kann Server-Code nie im Browser-Bundle landen.
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

// `async`, weil `cookies()` seit Next.js 15 ein Promise liefert.
export async function createClient() {
  const cookieStore = await cookies();

  // <Database>: macht alle Abfragen typsicher (Tabellen, Spalten, Rückgabetypen).
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      // Supabase fragt alle Cookies auf einmal ab und sucht sich seine
      // `sb-…-auth-token`-Cookies selbst heraus (große Tokens werden auf
      // mehrere Cookies verteilt, daher "getAll" statt einzelner Namen).
      getAll() {
        return cookieStore.getAll();
      },

      // Wird aufgerufen, wenn Supabase neue Tokens hat (z. B. nach dem Login
      // oder wenn ein abgelaufenes Access-Token erneuert wurde).
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Next.js erlaubt das Setzen von Cookies nur in Server Actions,
          // Route Handlern und im Proxy – NICHT beim Rendern einer Server
          // Component. Dort wirft `cookieStore.set` einen Fehler.
          //
          // Das ist in Ordnung und gewollt: Das Erneuern der Tokens übernimmt
          // der Proxy (Schritt 3), der vor jeder Seite läuft. Server
          // Components lesen die Session also nur.
          //
          // (Der zweite Parameter von `setAll` – Cache-Header gegen
          // CDN-Caching – ist nur dort relevant, wo wir die Response selbst
          // bauen, also im Proxy.)
        }
      },
    },
  });
}
