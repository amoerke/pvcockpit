/**
 * Chat-Assistent: beantwortet eine Frage mit Claude und unseren MCP-Tools.
 *
 * Hier steckt, was sonst Claude Code als MCP-Client erledigt:
 * 1. Tools beim MCP-Server erfragen (tools/list) und Claude anbieten.
 * 2. Claude fragen. Will es ein Tool, dieses per tools/call ausführen …
 * 3. … und das Ergebnis zurückgeben, bis Claude eine Antwort schreibt.
 *
 * Der MCP-Server läuft im selben Prozess (InMemoryTransport), nicht über
 * HTTP: Er bekommt direkt den geprüften Supabase-Client des Nutzers, ein
 * Token muss also nicht weitergereicht werden. RLS greift wie bei /api/mcp.
 *
 * Doku: docs/learning/04-chat.md, Schritt 7
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { AuthenticatedClient } from "@/lib/assistant/auth";
import { createMcpServer } from "@/lib/assistant/mcp-server";

/** Standard: klein und günstig, reicht für Fragen zu Kennzahlen. */
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";

// Limits gegen Kosten und Endlosschleifen (Entscheidungen in 04-chat.md).
const MAX_TOOL_ROUNDS = 5;
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `Du bist der Assistent im AmpereSolar Cockpit, dem Dashboard einer privaten PV-Anlage mit Batteriespeicher.
Beantworte Fragen zu Erzeugung, Verbrauch, Autarkie, Ersparnis und aktuellem Zustand der Anlage.

- Hole Zahlen immer über die Tools. Rate oder erfinde keine Werte.
- Bei relativen Zeitangaben („gestern“, „letzte Woche“, „insgesamt“) zuerst get_current_date aufrufen.
- Antworte auf Deutsch, kurz und direkt, mit Einheiten (kWh, %, €). Runde sinnvoll.
- Schreibe schlichten Text ohne Markdown: keine Sternchen, Überschriften oder Tabellen. Absätze und Aufzählungen mit „-“ sind erlaubt.
- Weise auf Datenlücken hin, wenn die Tool-Ergebnisse welche zeigen.
- Fragen ohne Bezug zur Anlage beantwortest du nicht, sondern sagst kurz, wofür du da bist.`;

/** Eine Nachricht im Verlauf, wie sie der Browser schickt: nur Text. */
export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Ein ausgeführter Tool-Aufruf – für die Anzeige im Chat (Schritt 8). */
export type ToolCall = { name: string; input: unknown; isError: boolean };

export type ChatResult = { answer: string; toolCalls: ToolCall[] };

export async function runChat(supabase: AuthenticatedClient, history: ChatMessage[]): Promise<ChatResult> {
  // Liest ANTHROPIC_API_KEY aus der Umgebung.
  const anthropic = new Anthropic();

  // MCP-Client und -Server über ein verbundenes Paar „Leitungen“ im Speicher.
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(supabase);
  const mcp = new Client({ name: "amperesolarcockpit-chat", version: "0.1.0" });

  try {
    await server.connect(serverTransport);
    await mcp.connect(clientTransport);

    // MCP- und Anthropic-Format unterscheiden sich nur im Namen des Schemas.
    const { tools } = await mcp.listTools();
    const claudeTools: Anthropic.Tool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    const messages: Anthropic.MessageParam[] = [...history];
    const toolCalls: ToolCall[] = [];

    for (let round = 0; ; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // "low": wenig Nachdenken, reicht für Kennzahl-Fragen und spart
        // Tokens. Das Denken zählt bei max_tokens mit.
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        tools: claudeTools,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        return { answer: finalText(response), toolCalls };
      }
      if (round === MAX_TOOL_ROUNDS) {
        return { answer: "Die Frage brauchte zu viele Abfragen. Bitte enger fassen.", toolCalls };
      }

      // Die Antwort UNVERÄNDERT anhängen, mit Thinking-Blöcken. Claude prüft,
      // dass der Verlauf vor ihnen gleich geblieben ist.
      messages.push({ role: "assistant", content: response.content });

      // Alle Tool-Aufrufe dieser Runde ausführen (Claude darf mehrere auf
      // einmal verlangen) und ALLE Ergebnisse in EINER Nachricht zurückgeben.
      const toolUses = response.content.filter((block) => block.type === "tool_use");
      // Parallel ausführen, Reihenfolge bleibt die von Claude (Promise.all).
      const executed = await Promise.all(
        toolUses.map(async (block) => {
          const input = block.input as Record<string, unknown>;
          const result = await mcp.callTool({ name: block.name, arguments: input });
          const isError = result.isError === true;
          const toolResult: Anthropic.ToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: block.id,
            content: toolText(result.content),
            is_error: isError,
          };
          return { call: { name: block.name, input, isError }, toolResult };
        }),
      );
      toolCalls.push(...executed.map((e) => e.call));
      messages.push({ role: "user", content: executed.map((e) => e.toolResult) });
    }
  } finally {
    await mcp.close();
    await server.close();
  }
}

/** Der Antworttext – oder eine Erklärung, warum es keinen gibt. */
function finalText(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") return "Diese Frage kann ich nicht beantworten.";

  // Nach Typ suchen, nicht content[0] nehmen: Vorne können Thinking-Blöcke stehen.
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (response.stop_reason === "max_tokens") {
    return text ? `${text} …\n\n(Antwort gekürzt.)` : "Die Antwort wurde zu lang. Bitte enger fragen.";
  }
  return text;
}

/** Tool-Ergebnisse unserer Server sind reiner Text (JSON oder Fehlermeldung). */
function toolText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part?.type === "text")
    .map((part) => part.text)
    .join("\n");
}
