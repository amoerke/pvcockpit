/**
 * Supabase-Client für den BROWSER (Client Components mit "use client").
 *
 * `createBrowserClient` liest und schreibt die Auth-Cookies selbst über
 * `document.cookie`. Wir müssen ihm deshalb keine Cookie-Funktionen mitgeben.
 * Intern hält er pro Browser-Tab nur eine Instanz (Singleton) – mehrfaches
 * Aufrufen von `createClient()` ist also unbedenklich.
 *
 * Wann brauchen wir ihn überhaupt? Nur für Dinge, die wirklich im Browser
 * passieren müssen (z. B. später Realtime-Updates fürs Dashboard). Login,
 * Logout und Datenabfragen laufen bei uns serverseitig (siehe ./server.ts).
 */
import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

export function createClient() {
  // <Database>: macht alle Abfragen typsicher (Tabellen, Spalten, Rückgabetypen).
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
