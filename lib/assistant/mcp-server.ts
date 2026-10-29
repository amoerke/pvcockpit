/**
 * MCP-Server des Cockpits: registriert die Tools, die ein Sprachmodell
 * aufrufen darf. Der Transport (HTTP) steckt in app/api/mcp/route.ts.
 *
 * Pro Request ein NEUER Server (stateless): Er lebt nur für eine Anfrage
 * und teilt nichts mit anderen Nutzern – wie der Supabase-Client.
 *
 * Der Server bekommt den geprüften Client des Aufrufers (authenticateRequest())
 * und reicht ihn an die Tools weiter. So fragt jedes Tool als genau dieser
 * Nutzer ab.
 */
import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { AuthenticatedClient } from "@/lib/assistant/auth";
import { getDailyEnergy } from "@/lib/assistant/data";
import { checkRange, DaySchema, toEnergySummary } from "@/lib/assistant/energy-summary";
import { berlinDay, TIME_ZONE } from "@/lib/time";

export function createMcpServer(supabase: AuthenticatedClient): McpServer {
  const server = new McpServer({ name: "amperesolarcockpit", version: "0.1.0" });

  server.registerTool(
    "get_current_date",
    {
      title: "Heutiges Datum",
      description:
        "Liefert den heutigen Kalendertag und Wochentag in Europe/Berlin. " +
        "Vor allen relativen Angaben wie „gestern“ oder „letzte Woche“ aufrufen.",
      // readOnlyHint: Das Tool ändert nichts. Clients dürfen es ohne
      // Rückfrage beim Nutzer ausführen.
      annotations: { readOnlyHint: true },
    },
    async () => {
      const now = Date.now();
      return json({
        today: berlinDay(now),
        weekday: new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: TIME_ZONE }).format(now),
        time_zone: TIME_ZONE,
      });
    },
  );

  server.registerTool(
    "get_energy_summary",
    {
      title: "Energie-Zusammenfassung",
      description:
        "Summen für einen Zeitraum (beide Tage inklusive): PV-Erzeugung, Hausverbrauch, " +
        "Netzbezug, Einspeisung, Batterie-Ladung und -Entladung in kWh sowie " +
        "Autarkiegrad und Eigenverbrauchsquote in Prozent. Für einen einzelnen Tag " +
        "from = to setzen. null bedeutet: keine Messwerte.",
      // Ein „raw shape“: Objekt aus zod-Schemas je Parameter. Das SDK macht
      // daraus das JSON-Schema für tools/list und prüft damit jeden Aufruf.
      inputSchema: { from: DaySchema, to: DaySchema },
      annotations: { readOnlyHint: true },
    },
    // from und to sind hier schon geprüft und typisiert (string).
    async ({ from, to }) => {
      const problem = checkRange(from, to, berlinDay(Date.now()));
      if (problem) return toolError(problem);

      const rows = await getDailyEnergy(supabase, from, to);
      return json(toEnergySummary(rows, from, to));
    },
  );

  return server;
}

/**
 * Tool-Ergebnis als JSON-Text. MCP kennt als Inhalt Text, Bilder usw.;
 * JSON als Text versteht jedes Modell.
 */
function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/**
 * Fehler, den das MODELL lesen soll (isError: true). Es ist kein
 * Protokollfehler: Der Aufruf kam an, nur die Eingabe passte nicht.
 */
function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
