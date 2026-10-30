/**
 * GET /.well-known/oauth-protected-resource/api/mcp
 *
 * Protected Resource Metadata für /api/mcp (RFC 9728). Diese Adresse nennt
 * der 401 von /api/mcp. Clients ohne diesen Hinweis bilden sie selbst: das
 * Well-Known-Präfix, dahinter der Pfad der Ressource.
 *
 * Öffentlich (kein Login): Sie verrät nur, wo man sich anmeldet. Der Proxy
 * lässt /.well-known/* deshalb ganz aus.
 */
import { protectedResourceMetadata } from "@/lib/assistant/oauth";

// CORS: Browser-Clients wie der MCP Inspector lesen die Datei per fetch()
// von einer anderen Origin. Die Daten sind öffentlich, `*` ist unbedenklich.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET(request: Request): Response {
  return Response.json(protectedResourceMetadata(request), { headers: CORS });
}

/** Preflight: Der Browser fragt vorab, ob die Origin lesen darf. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
