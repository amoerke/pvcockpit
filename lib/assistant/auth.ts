/**
 * Auth für API-Endpunkte wie /api/mcp: Wer ruft an?
 *
 * Zwei Wege, beide enden bei einem Supabase-Client, der als genau dieser
 * Nutzer abfragt – RLS greift also immer, nie die Service-Role:
 *
 * 1. `Authorization: Bearer <Access-Token>` – für Clients ohne Browser
 *    (Claude Code, MCP Inspector, Skripte).
 * 2. Session-Cookie – für Aufrufe aus dem eingeloggten Browser.
 *
 * Anders als verifySession() kein redirect(): Ein API-Client kann mit einer
 * Login-Seite nichts anfangen, er braucht ein 401.
 */
import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient as createCookieClient } from "@/lib/supabase/server";

export type AuthenticatedClient = SupabaseClient<Database>;

/**
 * Prüft den Request und liefert einen Client im Namen des Nutzers –
 * oder `null`, wenn sich niemand (gültig) ausgewiesen hat.
 */
export async function authenticateRequest(request: Request): Promise<AuthenticatedClient | null> {
  const header = request.headers.get("authorization");

  // Header vorhanden → NUR er zählt. Kein Rückfall aufs Cookie: Wer ein
  // falsches Token schickt, soll das am 401 merken, statt zufällig über ein
  // Cookie doch hereinzukommen.
  if (header !== null) {
    const token = /^Bearer (\S+)$/i.exec(header)?.[1];
    if (!token) return null;
    return bearerClient(token);
  }

  // Cookie-Weg: Der Proxy hat ein abgelaufenes Token schon erneuert.
  const supabase = await createCookieClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

async function bearerClient(token: string): Promise<AuthenticatedClient | null> {
  const supabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    // Jede Abfrage schickt das Token mit → PostgREST setzt auth.uid() und
    // wendet RLS an, genau wie beim Cookie-Client.
    global: { headers: { Authorization: `Bearer ${token}` } },
    // Ein Server-Client für EINEN Request: nichts speichern, nichts erneuern.
    // Abgelaufene Tokens erneuert der Aufrufer selbst.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Wie im Proxy: getUser() fragt den Auth-Server. Ein Token, das nur
  // „richtig aussieht“, reicht nicht – erst recht nicht ein abgelaufenes
  // oder eines, dessen Session per Abmelden widerrufen wurde.
  const { data } = await supabase.auth.getUser(token);
  return data.user ? supabase : null;
}
