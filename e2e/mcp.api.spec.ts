/**
 * E2E-Tests für den MCP-Endpoint /api/mcp – ohne Browser und ohne Modell.
 *
 * Die Tests sprechen JSON-RPC direkt über HTTP, genau wie Claude Code oder der
 * MCP Inspector. Statt `page` nutzen sie die Fixture `request`
 * (APIRequestContext): reine HTTP-Anfragen, die baseURL kommt aus der Config.
 *
 * Ausweis: ein Bearer-Token wie beim headersHelper in .mcp.json – nicht das
 * Cookie aus auth.setup.ts. So wird der Weg getestet, den echte MCP-Clients gehen.
 *
 * Doku: https://playwright.dev/docs/api-testing
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { getTestUser } from "./helpers";

const ENDPOINT = "/api/mcp";

// Ein fester Tag in der Vergangenheit mit Messwerten: Das Ergebnis hängt
// nicht vom heutigen Datum ab.
const PAST_DAY = "2026-10-28";

// Einmal pro Worker anmelden statt in jedem Test – jede Anmeldung legt eine
// neue Supabase-Session an. (Mit fullyParallel läuft beforeAll in JEDEM
// Worker, der Tests aus dieser Datei bekommt.)
let supabase: SupabaseClient;
let token: string;

test.beforeAll(async () => {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.signInWithPassword(getTestUser());
  if (error || !data.session) throw new Error(`Anmeldung fehlgeschlagen: ${error?.message}`);
  token = data.session.access_token;
});

test.afterAll(async () => {
  // scope "local": nur DIESE Session widerrufen. Der Standard "global" würde
  // auch die Session aus auth.setup.ts beenden, und parallel laufende
  // Browser-Tests würden plötzlich auf /login landen.
  await supabase.auth.signOut({ scope: "local" });
});

/** Zähler für die JSON-RPC-`id`: Sie ordnet die Antwort der Anfrage zu. */
let nextId = 1;

/** Schickt eine JSON-RPC-Nachricht und liefert die HTTP-Antwort. */
function post(
  request: APIRequestContext,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = { Authorization: `Bearer ${token}` },
) {
  return request.post(ENDPOINT, {
    data: { jsonrpc: "2.0", id: nextId++, method, params },
    headers: {
      // Pflicht bei Streamable HTTP: Der Client muss BEIDE Formate annehmen,
      // auch wenn unser Server nur JSON schickt. Sonst 406 Not Acceptable.
      Accept: "application/json, text/event-stream",
      ...headers,
    },
  });
}

/** Ruft ein Tool auf und liefert Text und isError des Tool-Ergebnisses. */
async function callTool(request: APIRequestContext, name: string, args: Record<string, unknown> = {}) {
  const response = await post(request, "tools/call", { name, arguments: args });
  expect(response.status()).toBe(200);
  const body = await response.json();
  // Tool-Fehler kommen als normales Ergebnis, nicht als JSON-RPC-`error`.
  expect(body.error).toBeUndefined();
  return { text: body.result.content[0].text as string, isError: body.result.isError === true };
}

test.describe("Auth", () => {
  test("ohne Ausweis: 401 mit WWW-Authenticate", async ({ request }) => {
    const response = await post(request, "tools/list", {}, {});
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toMatch(/^Bearer /);
  });

  test("ungültiges Token: 401", async ({ request }) => {
    const response = await post(request, "tools/list", {}, { Authorization: "Bearer quatsch" });
    expect(response.status()).toBe(401);
  });

  test("GET gibt es ohne Session nicht: 405", async ({ request }) => {
    const response = await request.get(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(405);
  });
});

// OAuth-Discovery: Ein Client ohne Token folgt dem Hinweis aus dem 401.
test.describe("Discovery", () => {
  test("401 nennt die Metadaten, die auf Supabase Auth zeigen", async ({ request }) => {
    const response = await post(request, "tools/list", {}, {});
    const header = response.headers()["www-authenticate"];
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1];
    expect(metadataUrl).toMatch(/\/\.well-known\/oauth-protected-resource\/api\/mcp$/);

    // Ohne Login lesbar – keine Weiterleitung nach /login.
    const metadata = await request.get(metadataUrl!, { maxRedirects: 0 });
    expect(metadata.status()).toBe(200);
    expect(metadata.headers()["access-control-allow-origin"]).toBe("*");

    const body = await metadata.json();
    expect(body.resource).toMatch(/\/api\/mcp$/);
    expect(body.authorization_servers).toEqual([`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`]);
  });

  test("Metadaten auch ohne Pfad", async ({ request }) => {
    const response = await request.get("/.well-known/oauth-protected-resource", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect((await response.json()).resource).toMatch(/\/api\/mcp$/);
  });
});

test.describe("Protokoll", () => {
  test("initialize nennt Server und Fähigkeit tools", async ({ request }) => {
    const response = await post(request, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1.0.0" },
    });
    expect(response.status()).toBe(200);
    const { result } = await response.json();
    expect(result.serverInfo.name).toBe("amperesolarcockpit");
    expect(result.capabilities.tools).toBeDefined();
  });

  test("tools/list: alle fünf Tools, alle nur lesend", async ({ request }) => {
    const { result } = await (await post(request, "tools/list")).json();
    const tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] = result.tools;

    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_current_date",
      "get_energy_by_period",
      "get_energy_summary",
      "get_live_status",
      "get_savings",
    ]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
  });
});

test.describe("Tools", () => {
  test("get_current_date: heute und data_since als ISO-Tag", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_current_date");
    expect(isError).toBe(false);

    const result = JSON.parse(text);
    expect(result.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.time_zone).toBe("Europe/Berlin");
    // Textvergleich reicht bei YYYY-MM-DD (siehe checkRange()).
    expect(result.data_since <= result.today).toBe(true);
  });

  test("get_energy_summary: ein Tag mit Daten", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_energy_summary", { from: PAST_DAY, to: PAST_DAY });
    expect(isError).toBe(false);

    const result = JSON.parse(text);
    expect(result.days_with_data).toBe(1);
    expect(result.pv_kwh).toBeGreaterThan(0);
    expect(result.autarky_percent).toBeGreaterThanOrEqual(0);
    expect(result.autarky_percent).toBeLessThanOrEqual(100);
  });

  test("get_energy_by_period: ein Eintrag je Tag", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_energy_by_period", {
      from: "2026-10-22",
      to: PAST_DAY,
      bucket: "day",
    });
    expect(isError).toBe(false);
    expect(JSON.parse(text).periods).toHaveLength(7);
  });

  test("get_savings: Euro-Beträge für einen Tag", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_savings", { from: PAST_DAY, to: PAST_DAY });
    expect(isError).toBe(false);
    expect(JSON.parse(text).total_eur).toEqual(expect.any(Number));
  });

  test("get_live_status: Ladezustand in Prozent", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_live_status");
    expect(isError).toBe(false);
    expect(JSON.parse(text).battery_soc_percent).toEqual(expect.any(Number));
  });
});

// Fehler, die das MODELL lesen soll: isError + verständlicher Text.
test.describe("Fehler für das Modell", () => {
  test("Schema: Tag, den es nicht gibt", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_energy_summary", {
      from: "2026-02-30",
      to: "2026-02-30",
    });
    expect(isError).toBe(true);
    expect(text).toContain("Input validation error");
  });

  test("Regel: from nach to", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_energy_summary", {
      from: PAST_DAY,
      to: "2026-10-01",
    });
    expect(isError).toBe(true);
    expect(text).toContain("liegt nach");
  });

  test("Regel: zu viele Buckets nennt die Lösung", async ({ request }) => {
    const { text, isError } = await callTool(request, "get_energy_by_period", {
      from: "2025-01-01",
      to: PAST_DAY,
      bucket: "day",
    });
    expect(isError).toBe(true);
    expect(text).toContain("Gröberen bucket wählen");
  });
});
