/**
 * Chat-Endpoint: POST /api/chat mit { messages: [{ role, content }, …] }
 * → { answer, toolCalls }.
 *
 * Auth wie bei /api/mcp: Session-Cookie (Chat-Seite) oder Bearer-Token
 * (Tests, Skripte). Ohne Ausweis 401, keine Weiterleitung.
 *
 * Ein Route Handler statt einer Server Action: So lässt er sich ohne
 * Browser testen, und für Streaming (später) ist ein Response-Body nötig.
 *
 * Doku: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { authenticateRequest } from "@/lib/assistant/auth";
import { runChat, type ChatMessage } from "@/lib/assistant/chat";

/** Nur die letzten Nachrichten gehen an Claude – jede kostet bei jeder Frage. */
const MAX_HISTORY = 10;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticateRequest(request);
  if (!caller) {
    return Response.json(
      { error: "Nicht angemeldet." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="amperesolarcockpit"' } },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const history = trimHistory(parsed.data.messages);
  if (history.at(-1)?.role !== "user") {
    return Response.json({ error: "Die letzte Nachricht muss eine Frage sein." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Der Assistent ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt)." }, { status: 503 });
  }

  try {
    return Response.json(await runChat(caller.supabase, history));
  } catch (error) {
    // Typisierte Fehler des SDK: Überlastung/Limits sind vorübergehend,
    // alles andere ist ein Fehler bei uns oder bei der API.
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Gerade zu viele Anfragen. Bitte gleich noch einmal." }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API:", error.status, error.message);
      return Response.json({ error: "Der Assistent ist gerade nicht erreichbar." }, { status: 502 });
    }
    throw error;
  }
}

/**
 * Letzte MAX_HISTORY Nachrichten; vorne abgeschnittene Antworten fallen weg,
 * denn die erste Nachricht an Claude muss vom Nutzer kommen.
 */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  const firstUser = recent.findIndex((message) => message.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}
