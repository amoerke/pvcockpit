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
 *
 * Die Beschreibungen sind für das MODELL geschrieben: Es sieht nur Name,
 * Beschreibung und Parameter-Schema und entscheidet daraus, welches Tool es
 * mit welchen Werten aufruft (docs/learning/04-chat.md, Schritt 4).
 */
import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { AuthenticatedClient } from "@/lib/assistant/auth";
import { getDailyEnergy, getFirstDataDay, getLatestRow, getSavingsByPeriod } from "@/lib/assistant/data";
import {
  BucketSchema,
  checkBuckets,
  checkRange,
  DaySchema,
  toEnergyByPeriod,
  toEnergySummary,
} from "@/lib/assistant/energy";
import { toLiveStatus } from "@/lib/assistant/live";
import { toSavingsSummary } from "@/lib/assistant/savings";
import { berlinDay, TIME_ZONE } from "@/lib/time";

/** Gilt für alle Tools: Sie lesen nur. Clients dürfen ohne Rückfrage ausführen. */
const READ_ONLY = { readOnlyHint: true } as const;

export function createMcpServer(supabase: AuthenticatedClient): McpServer {
  const server = new McpServer({ name: "amperesolarcockpit", version: "0.1.0" });

  server.registerTool(
    "get_current_date",
    {
      title: "Heutiges Datum",
      description:
        "Liefert den heutigen Kalendertag und Wochentag in Europe/Berlin sowie data_since, " +
        "den ersten Tag mit Messwerten. Vor allen relativen Angaben wie „gestern“, " +
        "„letzte Woche“ oder „insgesamt“ aufrufen; „insgesamt“ = from data_since bis heute.",
      annotations: READ_ONLY,
    },
    async () => {
      const now = Date.now();
      return json({
        today: berlinDay(now),
        weekday: new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: TIME_ZONE }).format(now),
        time_zone: TIME_ZONE,
        data_since: await getFirstDataDay(supabase),
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
        "from = to setzen. null bedeutet: keine Messwerte. " +
        "Für Vergleiche zwischen Tagen oder Monaten stattdessen get_energy_by_period.",
      // Ein „raw shape“: Objekt aus zod-Schemas je Parameter. Das SDK macht
      // daraus das JSON-Schema für tools/list und prüft damit jeden Aufruf.
      inputSchema: { from: DaySchema, to: DaySchema },
      annotations: READ_ONLY,
    },
    // from und to sind hier schon geprüft und typisiert (string).
    async ({ from, to }) => {
      const problem = checkRange(from, to, berlinDay(Date.now()));
      if (problem) return toolError(problem);

      const rows = await getDailyEnergy(supabase, from, to);
      return json(toEnergySummary(rows, from, to));
    },
  );

  server.registerTool(
    "get_energy_by_period",
    {
      title: "Energie je Tag, Monat oder Jahr",
      description:
        "Dieselben Werte wie get_energy_summary, aber ein Eintrag je Tag, Monat oder Jahr – " +
        "für Vergleiche und Fragen wie „Welcher Tag hatte die meiste PV?“ oder " +
        "„Wie hat sich der Autarkiegrad entwickelt?“. Höchstens 100 Einträge; " +
        "für längere Zeiträume bucket month oder year wählen. " +
        "Einträge mit days_with_data = 0 haben keine Messwerte (Werte null).",
      inputSchema: { from: DaySchema, to: DaySchema, bucket: BucketSchema },
      annotations: READ_ONLY,
    },
    async ({ from, to, bucket }) => {
      const problem = checkRange(from, to, berlinDay(Date.now())) ?? checkBuckets(from, to, bucket);
      if (problem) return toolError(problem);

      const rows = await getDailyEnergy(supabase, from, to);
      return json(toEnergyByPeriod(rows, from, to, bucket));
    },
  );

  server.registerTool(
    "get_savings",
    {
      title: "Ersparnis in Euro",
      description:
        "Finanzieller Nutzen der Anlage in einem Zeitraum (beide Tage inklusive): " +
        "savings_eur = gesparte Stromkosten durch selbst verbrauchten PV-Strom, " +
        "feed_in_eur = Einspeisevergütung, total_eur = beides zusammen. " +
        "Gerechnet mit den hinterlegten Tarifen; days_without_tariff > 0 heißt, " +
        "dass für diese Tage die Euro-Beträge fehlen.",
      inputSchema: { from: DaySchema, to: DaySchema },
      annotations: READ_ONLY,
    },
    async ({ from, to }) => {
      const problem = checkRange(from, to, berlinDay(Date.now()));
      if (problem) return toolError(problem);

      // bucket "year": Für die Summe zählt die Gruppierung nicht – je gröber,
      // desto weniger Zeilen kommen aus der Datenbank.
      const rows = await getSavingsByPeriod(supabase, from, to, "year");
      return json(toSavingsSummary(rows, from, to));
    },
  );

  server.registerTool(
    "get_live_status",
    {
      title: "Aktueller Zustand",
      description:
        "Der neueste Messwert (etwa minütlich): aktuelle Leistungen in Watt für PV, " +
        "Hausverbrauch, Batterie-Ladung/-Entladung, Netzbezug/Einspeisung sowie der " +
        "Ladezustand der Batterie in Prozent. Für Fragen zu „jetzt“ oder „gerade“. " +
        "age_minutes nennt das Alter des Werts; ist er älter als etwa 10 Minuten, darauf hinweisen.",
      annotations: READ_ONLY,
    },
    async () => {
      const row = await getLatestRow(supabase);
      if (!row) return toolError("Es gibt noch keine Messwerte.");
      return json(toLiveStatus(row, Date.now()));
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
