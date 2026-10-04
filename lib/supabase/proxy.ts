/**
 * Session-Logik für den Next.js-Proxy (siehe /proxy.ts im Projekt-Root).
 *
 * Diese Funktion läuft VOR jeder Seite und erledigt zwei Dinge:
 *
 * 1. TOKEN ERNEUERN: Das Access-Token (JWT) lebt nur 1 Stunde. Ist es
 *    abgelaufen, tauscht Supabase es per Refresh-Token gegen ein neues und
 *    schreibt es als Cookie in die Antwort. Server Components dürfen keine
 *    Cookies schreiben (siehe lib/supabase/server.ts) – deshalb passiert das
 *    hier, bevor gerendert wird.
 *
 * 2. GROB WEITERLEITEN: Ohne Login → /login. Mit Login auf /login → /dashboard.
 *    Das ist nur eine "optimistische" Vorab-Prüfung für eine gute UX. Die
 *    verbindliche Prüfung passiert nah an den Daten im Data Access Layer
 *    (Schritt 4). Grund: Server Actions sind eigene POST-Endpunkte und können
 *    am Proxy-Matcher vorbei aufgerufen werden.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "./env";

/** Pfade, die ohne Login erreichbar sein müssen. */
const PUBLIC_PATHS = ["/login", "/auth"];

/** Wohin eingeloggte Nutzer geschickt werden, die /login aufrufen. */
const HOME_PATH = "/dashboard";

function isPublicPath(pathname: string) {
  // "/auth" soll auch "/auth/confirm" erlauben, aber nicht "/authxyz".
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function updateSession(request: NextRequest) {
  // Die Antwort, die wir am Ende zurückgeben. `NextResponse.next()` heißt:
  // "Request normal weiterreichen" (an die Seite bzw. den Route Handler).
  // `let`, weil setAll sie unten ggf. neu erzeugen muss.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Neue Tokens müssen an ZWEI Stellen landen:
        //
        // a) Im Request – damit die Server Components, die gleich in DIESEM
        //    Request rendern, schon das neue Token sehen (sonst würden sie
        //    mit dem abgelaufenen Token arbeiten).
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        // b) In der Response – damit der Browser die neuen Cookies speichert.
        //    Wir erzeugen die Response neu, damit sie den geänderten Request
        //    (aus a) weiterreicht.
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );

        // Cache-Header (Cache-Control, Expires, Pragma): Verhindern, dass ein
        // CDN diese Antwort samt Session-Cookies zwischenspeichert und an
        // andere Besucher ausliefert.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // WICHTIG: Zwischen createServerClient() und getUser() keinen weiteren Code
  // einfügen. getUser() ist der Aufruf, der das Erneuern der Tokens auslöst –
  // Logik davor würde mit einer evtl. veralteten Session arbeiten.
  //
  // Warum getUser() und nicht getClaims()?
  // - getSession() liest das Cookie nur aus, ohne es zu prüfen → auf dem
  //   Server niemals für Auth-Entscheidungen verwenden.
  // - getClaims() prüft die JWT-Signatur lokal – aber nur bei asymmetrischen
  //   Schlüsseln (RS256/ES256). Unsere self-hosted Instanz signiert mit dem
  //   gemeinsamen JWT-Secret (HS256); das kennt nur der Server. getClaims()
  //   würde dann ohnehin intern getUser() aufrufen.
  // - getUser() fragt den Auth-Server: "Ist dieses Token gültig?" Das kostet
  //   einen Netzwerk-Roundtrip, ist aber verlässlich (erkennt z. B. auch
  //   gesperrte Nutzer).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Fall 1: Nicht eingeloggt und geschützte Seite → zum Login.
  if (!user && !isPublicPath(pathname)) {
    return redirectWithCookies(request, response, "/login");
  }

  // Fall 2: Eingeloggt, aber auf /login → direkt ins Dashboard.
  if (user && pathname === "/login") {
    return redirectWithCookies(request, response, HOME_PATH);
  }

  // Fall 3: Alles in Ordnung → normal weiter, MIT den ggf. erneuerten Cookies.
  // Niemals hier ein frisches NextResponse.next() zurückgeben – dann gingen
  // die neuen Tokens verloren und Browser und Server liefen auseinander
  // (Folge: Nutzer wird scheinbar zufällig ausgeloggt).
  return response;
}

/**
 * Leitet weiter, OHNE die eben erneuerten Session-Cookies zu verlieren.
 * Eine Weiterleitung ist eine neue Response – die Cookies aus `response`
 * müssen wir deshalb explizit übertragen.
 */
function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
) {
  // URL klonen statt neu bauen: behält Host, Port und Protokoll bei.
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  response.cookies
    .getAll()
    .forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
