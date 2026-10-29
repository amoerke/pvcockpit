/**
 * MCP-Endpoint: POST /api/mcp nimmt JSON-RPC-Nachrichten entgegen
 * (initialize, tools/list, tools/call …) und antwortet mit JSON-RPC.
 *
 * Transport „Streamable HTTP“, stateless: keine Session-ID, jeder Request
 * steht für sich. Dafür braucht es nur POST. GET (Server-Push per SSE) und
 * DELETE (Session beenden) gibt es ohne Session nicht. Für Methoden ohne
 * Export antwortet Next.js selbst mit 405 Method Not Allowed.
 *
 * Doku: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer } from "@/lib/assistant/mcp-server";

export async function POST(request: Request): Promise<Response> {
  const server = createMcpServer();
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
