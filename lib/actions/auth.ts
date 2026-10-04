/**
 * Auth-bezogene Server Actions, die von mehreren Seiten genutzt werden.
 *
 * Bewusst nicht unter app/dashboard/: Der Logout-Button sitzt später in
 * einer Kopfzeile, die auf jeder geschützten Seite erscheinen kann.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Meldet den aktuellen Nutzer ab und leitet zu /login weiter.
 *
 * Verwendung (Server oder Client Component):
 *   <form action={logout}> … <button type="submit"> … </form>
 *
 * Warum ein Formular mit POST und kein Link (`<a href="/logout">`)?
 * Ein GET-Link könnte ungewollt ausgelöst werden – durch Prefetching des
 * Next-Routers oder durch ein `<img src=".../logout">` auf einer fremden
 * Seite. Server Actions laufen immer per POST, und Next.js prüft zusätzlich
 * den Origin-Header (Schutz gegen CSRF).
 *
 * Keine verifySession()-Prüfung nötig: Ohne Session gibt es nichts
 * abzumelden – signOut() ist dann einfach wirkungslos.
 */
export async function logout() {
  const supabase = await createClient();

  // scope "local": nur DIESE Sitzung beenden (dieses Gerät/dieser Browser).
  // Der Standard wäre "global" – das meldet den Nutzer auf ALLEN Geräten ab.
  //
  // signOut() widerruft das Refresh-Token beim Auth-Server und löscht über
  // `setAll` die Session-Cookies.
  //
  // Hinweis: Ein bereits ausgestelltes Access-Token (JWT) bleibt bis zu
  // seinem Ablauf (max. 1 Stunde) technisch gültig – JWTs lassen sich nicht
  // "zurückrufen". Für dieses Dashboard ist das akzeptabel.
  await supabase.auth.signOut({ scope: "local" });

  // Router-Cache leeren, damit keine zwischengespeicherte Dashboard-Ansicht
  // nach dem Logout mehr angezeigt wird.
  revalidatePath("/", "layout");
  redirect("/login");
}
