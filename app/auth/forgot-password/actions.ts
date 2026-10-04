/**
 * Server Action: Mail zum Zurücksetzen des Passworts anfordern.
 *
 * Kein verifySession(): Wer sein Passwort vergessen hat, ist nicht eingeloggt.
 */
"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  ForgotPasswordSchema,
  type ForgotPasswordState,
} from "./definitions";

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: String(formData.get("email") ?? ""),
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  // Den Link in der Mail baut die Vorlage supabase/templates/recovery.html
  // (→ /auth/confirm?…&type=recovery&next=/auth/set-password).
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    // z. B. "over_email_send_rate_limit" – der Auth-Server begrenzt, wie
    // viele Mails pro Stunde verschickt werden. Nur loggen, siehe unten.
    console.error("[forgot-password] resetPasswordForEmail fehlgeschlagen:", error.code);
  }

  // IMMER dieselbe Antwort – egal ob die Adresse existiert, ob ein Fehler
  // auftrat oder ob eine Mail rausging. Sonst ließe sich über dieses
  // Formular herausfinden, welche E-Mail-Adressen ein Konto haben
  // (User Enumeration – wie beim Login).
  return { submitted: true, email };
}
