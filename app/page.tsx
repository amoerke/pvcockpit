/**
 * Startseite "/" – hat keinen eigenen Inhalt, sondern leitet weiter.
 *
 * Nicht eingeloggt: Der Proxy hat bereits nach /login umgeleitet, bevor diese
 * Seite überhaupt rendert. Eingeloggt: weiter zum Dashboard.
 *
 * redirect() funktioniert direkt in einer Server Component und antwortet mit
 * einer Weiterleitung, ohne dass HTML gerendert wird.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
