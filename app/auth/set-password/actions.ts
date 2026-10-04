/**
 * Server Action: neues Passwort für den eingeloggten Nutzer setzen.
 *
 * Wer hier ankommt, hat über /auth/confirm (Einladungs- oder Reset-Link)
 * gerade eine Session bekommen. Die Action setzt für DIESEN Nutzer das
 * Passwort – welcher Nutzer das ist, ergibt sich allein aus der Session,
 * nie aus Formulardaten.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { SetPasswordSchema, type SetPasswordState } from "./definitions";

export async function setPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  // Regel aus dem DAL: Jede Server Action, die einen Login voraussetzt,
  // prüft ihn SELBST. Die Seite /auth/set-password prüft zwar auch – das
  // schützt die Action aber nicht (sie ist ein eigener POST-Endpunkt).
  await verifySession();

  const parsed = SetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[set-password] updateUser fehlgeschlagen:", error.code);

    // Hier dürfen wir konkret werden – der Nutzer ist bereits authentifiziert,
    // es gibt nichts auszuspähen.
    switch (error.code) {
      case "same_password":
        return { error: "Das neue Passwort muss sich vom bisherigen unterscheiden." };
      case "weak_password":
        return { error: "Das Passwort ist zu schwach. Bitte ein längeres wählen." };
      default:
        return { error: "Passwort konnte nicht gespeichert werden. Bitte erneut versuchen." };
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
