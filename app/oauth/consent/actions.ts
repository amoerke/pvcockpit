/**
 * Server Action für /oauth/consent: Zustimmung oder Ablehnung an Supabase
 * melden und zum Client zurückspringen.
 *
 * Eine Server Action statt eines Route Handlers (wie im Supabase-Beispiel):
 * Next.js prüft bei Server Actions den Origin-Header. Ein Formular auf einer
 * fremden Seite kann also nicht in deinem Namen „Erlauben“ drücken (CSRF).
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

const DecisionSchema = z.object({
  authorization_id: z.string().min(1).max(200),
  decision: z.enum(["approve", "deny"]),
});

export async function decide(formData: FormData) {
  // Jede Server Action ist ein eigener POST-Endpunkt → selbst prüfen.
  await verifySession();

  const parsed = DecisionSchema.safeParse({
    authorization_id: formData.get("authorization_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) redirect("/oauth/consent");

  const { authorization_id: id, decision } = parsed.data;
  const supabase = await createClient();

  // skipBrowserRedirect: Wir sind auf dem Server, es gibt kein Fenster zum
  // Umleiten. Die Adresse kommt zurück, umleiten tut redirect() unten.
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });

  if (error || !data) {
    console.error("[oauth] Entscheidung fehlgeschlagen:", error?.code ?? error?.message);
    redirect(`/oauth/consent?${new URLSearchParams({ authorization_id: id, error: "1" })}`);
  }

  // Zurück zum Client – bei „Erlauben“ mit ?code=…, bei „Ablehnen“ mit
  // ?error=access_denied. Die Adresse stammt von Supabase, nicht aus dem
  // Formular: Sie ist die beim Registrieren hinterlegte redirect_uri.
  redirect(data.redirect_url);
}
