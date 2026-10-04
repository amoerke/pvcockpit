/**
 * GET /auth/confirm – Ziel der Links in Einladungs- und Passwort-Reset-Mails.
 *
 * Ein ROUTE HANDLER: Statt einer Seite (page.tsx) liegt hier eine route.ts,
 * die pro HTTP-Methode eine Funktion exportiert (hier nur GET). Es wird kein
 * HTML gerendert – wir verarbeiten den Request und leiten weiter.
 *
 * Der Link in der Mail sieht so aus (siehe supabase/templates/*.html):
 *   /auth/confirm?token_hash=…&type=invite&next=/auth/set-password
 *
 * Ablauf:
 * 1. token_hash + type aus der URL lesen.
 * 2. verifyOtp() schickt beides an den Auth-Server. Ist der Token gültig und
 *    unbenutzt, bekommen wir eine Session – der Server-Client schreibt sie
 *    über `setAll` als Cookies (in Route Handlern erlaubt).
 * 3. Weiter zu `next` (z. B. Passwort setzen).
 *
 * Warum token_hash statt des Standard-Links von Supabase? Der Standard-Link
 * liefert die Tokens im URL-Fragment (`#access_token=…`). Das Fragment schickt
 * der Browser nie an den Server – unser serverseitiger Code sähe es nicht.
 *
 * Der Pfad /auth/* ist im Proxy als öffentlich freigegeben – logisch, denn
 * wer den Link klickt, ist (noch) nicht eingeloggt.
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Nur diese Mail-Typen nutzt die App. Alles andere (z. B. "signup" – die
 * Registrierung ist deaktiviert) lehnen wir ab, statt es blind
 * weiterzureichen.
 */
const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery"];

/**
 * Schutz vor "Open Redirect": `next` kommt aus der URL und ist damit vom
 * Angreifer frei wählbar. Ohne Prüfung könnte jemand einen echten
 * Einladungslink mit `next=https://boese-seite.example` verschicken – nach
 * dem Klick landet das Opfer auf der fremden Seite, scheinbar von uns
 * geschickt.
 *
 * Erlaubt sind daher nur relative Pfade innerhalb der App:
 * - muss mit "/" beginnen
 * - darf NICHT mit "//" oder "/\" beginnen – Browser interpretieren
 *   "//boese.example" als absolute URL auf einen anderen Host.
 */
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      // Session-Cookies sind gesetzt. redirect() funktioniert auch in Route
      // Handlern; Next.js hängt die per cookies() gesetzten Cookies an die
      // Weiterleitung an.
      redirect(next);
    }

    // Typisch: "otp_expired" – Link abgelaufen oder schon einmal benutzt
    // (Links sind Einmal-Links). Details nur ins Server-Log.
    console.error("[auth/confirm] verifyOtp fehlgeschlagen:", error.code);
  }

  // Ungültiger, abgelaufener oder unvollständiger Link → Login-Seite mit
  // Hinweis. Die Login-Seite liest den Parameter `error` aus der URL.
  redirect("/login?error=invalid_link");
}
