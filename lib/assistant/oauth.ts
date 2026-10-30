/**
 * OAuth-Discovery für den MCP-Endpoint: Wie findet ein Client heraus, wo er
 * sich ein Token holt?
 *
 * 1. /api/mcp antwortet ohne Token mit 401. Der Header WWW-Authenticate
 *    nennt die Adresse der „Protected Resource Metadata“.
 * 2. Dort steht, welcher Authorization Server Tokens für uns ausstellt:
 *    Supabase Auth.
 * 3. Den Rest (Login, Registrierung, Token-Tausch) erledigt der Client mit
 *    Supabase. Die App ist erst wieder bei der Zustimmung beteiligt (Schritt 2).
 *
 * Doku: docs/learning/05-oauth.md, Schritt 1 (RFC 9728)
 */
import "server-only";

import { supabaseUrl } from "@/lib/supabase/env";

export const MCP_PATH = "/api/mcp";

/** Wo die Metadaten liegen: der Pfad der Ressource hinter dem Well-Known-Präfix. */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/**
 * Öffentliche Adresse der App, z. B. https://pv.dataminer.cloud.
 *
 * APP_URL hat Vorrang: Hinter einem Reverse-Proxy sieht die App den Request
 * evtl. als http://… oder mit internem Hostnamen. Ohne APP_URL (lokal) gilt
 * die Adresse des Requests.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

/**
 * Protected Resource Metadata (RFC 9728). `resource` muss exakt die Adresse
 * sein, die der Client aufruft. Clients vergleichen das.
 */
export function protectedResourceMetadata(request: Request) {
  return {
    resource: `${appOrigin(request)}${MCP_PATH}`,
    // Der „issuer“ von Supabase Auth. Der Client sucht dort die
    // Authorization Server Metadata (Login- und Token-Adresse).
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    // Das Token kommt nur im Header, nie als Query-Parameter.
    bearer_methods_supported: ["header"],
    resource_name: "AmpereSolar Cockpit",
  };
}

/** Header-Wert für jede 401 von /api/mcp. */
export function wwwAuthenticate(request: Request): string {
  return `Bearer realm="amperesolarcockpit", resource_metadata="${appOrigin(request)}${RESOURCE_METADATA_PATH}"`;
}
