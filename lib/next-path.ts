/**
 * Rücksprung nach dem Login: `?next=/oauth/consent?authorization_id=…`
 *
 * Der Wert kommt aus der URL, also von außen. Ungeprüft wäre er ein „Open
 * Redirect“: Ein Link wie /login?next=https://boese.example schickt Nutzer
 * nach dem Login auf eine fremde Seite, die wie unsere aussieht. Deshalb
 * sind nur Pfade INNERHALB der App erlaubt.
 */

/** Liefert einen sicheren Pfad (mit Query) oder `null`. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;

  // Relativ zu einer Platzhalter-Origin auflösen. „//boese.example“ oder
  // „/\boese.example“ sehen aus wie Pfade, sind für Browser aber Adressen
  // einer anderen Origin. Nach dem Auflösen fällt das auf.
  const base = "http://app.invalid";
  const url = new URL(value, base);
  if (url.origin !== base) return null;

  return url.pathname + url.search;
}
