// -----------------------------------------------------------------------------
// Holt ein Supabase-Access-Token für den MCP-Endpoint /api/mcp.
//
// Aufruf (Umgebungsvariablen aus .env.local):
//   npm run mcp:token              → nur das Token (für MCP Inspector, curl)
//   npm run mcp:token -- --headers → {"Authorization":"Bearer …"} als JSON
//                                    (für den headersHelper in .mcp.json)
//
// Nutzer: MCP_USER_EMAIL / MCP_USER_PASSWORD, sonst der E2E-Testnutzer
// (E2E_USER_EMAIL / E2E_USER_PASSWORD). Abgefragt wird immer als dieser
// Nutzer – RLS greift wie im Browser.
//
// Das Token gilt 1 Stunde. Danach einfach erneut aufrufen (Claude Code tut
// das beim nächsten Verbinden über den headersHelper selbst).
// -----------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.MCP_USER_EMAIL ?? process.env.E2E_USER_EMAIL;
const password = process.env.MCP_USER_PASSWORD ?? process.env.E2E_USER_PASSWORD;

if (!url || !anonKey || !email || !password) {
  // stderr: stdout gehört allein dem Token bzw. JSON – der headersHelper
  // würde jeden zusätzlichen Text als kaputtes JSON verwerfen.
  console.error(
    "Fehler: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY und " +
      "MCP_USER_EMAIL/MCP_USER_PASSWORD (oder E2E_USER_*) müssen gesetzt sein.",
  );
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  // Ein Skript, ein Aufruf: nichts speichern, nichts im Hintergrund erneuern.
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session) {
  console.error("Anmeldung fehlgeschlagen:", error?.message ?? "keine Session");
  process.exit(1);
}

const token = data.session.access_token;
console.log(
  process.argv.includes("--headers") ? JSON.stringify({ Authorization: `Bearer ${token}` }) : token,
);
