/**
 * Zentrale Stelle für die Supabase-Konfiguration aus den Umgebungsvariablen.
 *
 * Warum eine eigene Datei?
 * - Fehlt eine Variable, wollen wir sofort eine verständliche Fehlermeldung
 *   statt eines kryptischen "Invalid URL" tief im Supabase-Client.
 * - Browser- und Server-Client nutzen dieselben Werte.
 *
 * Wichtig: Next.js ersetzt `NEXT_PUBLIC_`-Variablen nur bei *direktem* Zugriff
 * (`process.env.NEXT_PUBLIC_…`) durch ihren Wert. Ein dynamischer Zugriff wie
 * `process.env[name]` wäre im Browser `undefined` – deshalb hier ausgeschrieben.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase-Konfiguration fehlt: NEXT_PUBLIC_SUPABASE_URL und " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY müssen in .env.local gesetzt sein " +
      "(Vorlage: .env.example).",
  );
}

export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;
