/**
 * Server Actions für /login.
 *
 * "use server" macht jede exportierte async-Funktion dieser Datei zu einer
 * Server Action: Next.js erzeugt dafür einen POST-Endpunkt. Das Formular im
 * Browser ruft die Funktion auf, als wäre sie lokal – tatsächlich läuft sie
 * auf dem Server. Wir schreiben also keine eigene API-Route.
 *
 * Sicherheit: Jede Server Action ist ein öffentlich erreichbarer Endpunkt.
 * Alle Eingaben gelten als nicht vertrauenswürdig → immer validieren.
 * (Login ist die Ausnahme von der Regel "zuerst verifySession()" – hier soll
 * man ja gerade erst eingeloggt werden.)
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { LoginSchema, type LoginState } from "./definitions";

/**
 * Signatur für useActionState: (vorheriger Zustand, Formulardaten) → neuer Zustand.
 * Den vorherigen Zustand brauchen wir hier nicht, daher `_prevState`.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // 1. Eingaben validieren. formData.get() liefert `FormDataEntryValue | null`
  //    – erst Zod macht daraus garantiert zwei Strings.
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      email: String(formData.get("email") ?? ""),
    };
  }

  const { email, password } = parsed.data;

  // 2. Bei Supabase anmelden. Bei Erfolg ruft der Server-Client intern
  //    `setAll` auf und schreibt die Session-Cookies. Das ist hier erlaubt,
  //    weil wir uns in einer Server Action befinden (nicht beim Rendern).
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Bewusst KEINE Unterscheidung zwischen "E-Mail unbekannt" und "Passwort
    // falsch". Sonst könnte ein Angreifer ausprobieren, welche E-Mail-Adressen
    // ein Konto haben (User Enumeration).
    //
    // Den echten Fehler loggen wir serverseitig – er erscheint im Terminal
    // von `next dev`, aber nie im Browser.
    console.error("[login] signInWithPassword fehlgeschlagen:", error.code);

    return {
      error:
        error.code === "invalid_credentials"
          ? "E-Mail oder Passwort ist falsch."
          : "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.",
      email,
    };
  }

  // 3. Erfolg. revalidatePath leert den Client-Router-Cache für alle Seiten
  //    unter dem Root-Layout – sonst könnte der Browser noch eine
  //    zwischengespeicherte "nicht eingeloggt"-Version anzeigen.
  revalidatePath("/", "layout");

  // redirect() wirft intern eine spezielle Exception, die Next.js in eine
  // Weiterleitung übersetzt. Deshalb steht es AUSSERHALB jedes try/catch.
  redirect("/dashboard");
}
