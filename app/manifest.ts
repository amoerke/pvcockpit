import type { MetadataRoute } from "next";

/**
 * Web App Manifest (wird unter /manifest.webmanifest ausgeliefert).
 *
 * Safari liest es beim "Zum Home-Bildschirm" und startet die App danach
 * ohne Browser-Leisten. `display: "standalone"` ist die größte Stufe, die
 * iPadOS für Web-Apps kennt ("fullscreen" wird dort wie standalone behandelt).
 * Der Proxy-Matcher (proxy.ts) muss diese Datei ohne Login durchlassen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AmpereSolar Cockpit",
    short_name: "Cockpit",
    description: "Statistiken zu den AmpereStorage-Werten",
    // Ausgeloggt leitet der Proxy von /dashboard nach /login um, eingeloggt
    // landet man direkt im Dashboard.
    start_url: "/dashboard",
    // scope: "/" damit auch /login, /auth/* und /oauth/* in der App bleiben.
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
