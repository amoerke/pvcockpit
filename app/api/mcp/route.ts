/**
 * MCP-Endpoint: POST /api/mcp nimmt JSON-RPC-Nachrichten entgegen
 * (initialize, tools/list, tools/call …) und antwortet mit JSON-RPC.
 *
 * Transport „Streamable HTTP“, stateless: keine Session-ID, jeder Request
 * steht für sich. Dafür braucht es nur POST. GET (Server-Push per SSE) und
 * DELETE (Session beenden) gibt es ohne Session nicht. Für Methoden ohne
 * Export antwortet Next.js selbst mit 405 Method Not Allowed.
 *
 * Auth: Bearer-Token oder Session-Cookie (lib/assistant/auth.ts). Ohne
 * gültigen Ausweis 401 – der Proxy leitet /api/* bewusst nicht nach /login um.
 *
 * Doku: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { authenticateRequest, type Caller } from "@/lib/assistant/auth";
import { createMcpServer } from "@/lib/assistant/mcp-server";
import { wwwAuthenticate } from "@/lib/assistant/oauth";

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticateRequest(request);
  if (!caller) {
    // WWW-Authenticate sagt dem Client, WELCHE Art Ausweis erwartet wird –
    // und mit resource_metadata, WO er per OAuth einen bekommt.
    // Die MCP-Spezifikation verlangt den Header bei 401.
    return Response.json(
      { error: "Nicht angemeldet: Session-Cookie oder Authorization: Bearer <Token> erforderlich." },
      { status: 401, headers: { "WWW-Authenticate": wwwAuthenticate(request) } },
    );
  }

  await logCall(request, caller);

  const server = createMcpServer(caller.supabase);
  const transport = new WebStandardStreamableHTTPServerTransport({
    // undefined = stateless: keine Session-Verwaltung.
    sessionIdGenerator: undefined,
    // Eine JSON-Antwort statt eines SSE-Streams. Unsere Tools antworten in
    // einem Stück, Streaming bringt hier nichts.
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    // Die Antwort ist fertig – Server und Transport werden nicht mehr gebraucht.
    await server.close();
  }
}

/**
 * Eine Zeile pro Aufruf im Server-Log: wer (Weg + OAuth-Client) was
 * (JSON-RPC-Methode, Tool). So lässt sich später nachvollziehen, welcher
 * Client welche Daten gelesen hat. Keine Parameter, keine Ergebnisse.
 */
async function logCall(request: Request, caller: Caller) {
  // clone(): Der Body lässt sich nur einmal lesen, der Transport braucht ihn noch.
  const body: unknown = await request.clone().json().catch(() => null);
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    const method = typeof message?.method === "string" ? message.method : "?";
    const tool = method === "tools/call" ? message?.params?.name : undefined;
    // Eine Zeile als Text (kein Objekt): Node bricht Objekte sonst über
    // mehrere Zeilen um, und grep findet nur den Anfang.
    console.info(`[mcp] via=${caller.via} client=${caller.clientId ?? "-"} ${method}${tool ? ` ${tool}` : ""}`);
  }
}
