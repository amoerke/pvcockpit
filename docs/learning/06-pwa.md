# Kapitel 6 – Installierbare Web-App (iPad)

Ziel: Das Cockpit lässt sich in Safari über „Zum Home-Bildschirm“ ablegen und
startet danach im Vollbild, ohne Safari-Leisten.

## Was ist eine PWA auf iOS?

Eine PWA (Progressive Web App) ist eine normale Website, die per
**Web App Manifest** (JSON) sagt, wie sie als App aussehen soll: Name, Icons,
Farben, Startseite, Anzeigemodus. Safari liest das Manifest beim
„Zum Home-Bildschirm“ und legt ein Icon an. Gestartet wird die Seite dann in
einem eigenen Fenster ohne Adressleiste.

## Warum `standalone`?

`display` kennt `browser`, `minimal-ui`, `standalone` und `fullscreen`. iPadOS
behandelt Web-Apps immer wie `standalone` (keine Browser-Leisten, die
Statusleiste oben bleibt). Ein echtes Vollbild wie bei nativen Spielen gibt es
für Web-Apps nicht, `standalone` ist daher der richtige Wert.

## Bausteine im Projekt

| Datei | Aufgabe |
|---|---|
| `app/manifest.ts` | Manifest, Next liefert es unter `/manifest.webmanifest` aus |
| `app/layout.tsx` | `metadata.appleWebApp` (Titel, Statusleiste) und `viewport` (`viewportFit: "cover"`, `themeColor`) |
| `app/apple-icon.png` | Next macht daraus `<link rel="apple-touch-icon">` (180×180, ohne Transparenz) |
| `public/icons/` | Icons 192, 512 und `maskable` fürs Manifest |
| `scripts/gen-icons.mjs` | Erzeugt alle Icons aus `scripts/icon-source.svg` |
| `app/globals.css` | `env(safe-area-inset-*)` als Body-Padding |

Das Icon ist ein **Platzhalter** (Sonne mit Blitz). Zum Austauschen genügt es,
`icon-source.svg` zu ändern und das Skript neu laufen zu lassen.

## Safe Area

Mit `viewport-fit=cover` darf die Seite bis an die Display-Ränder reichen,
auch unter Statusleiste, Notch und Home-Indikator. `env(safe-area-inset-top)`
und Verwandte liefern, wie viel Platz frei bleiben muss. Ohne
`viewport-fit=cover` liefern sie immer 0. `statusBarStyle: "default"` hält die
Statusleiste undurchsichtig, der Inhalt rutscht also nicht darunter.

## Warum der Proxy-Matcher wichtig ist

Safari lädt Manifest und Icons **ohne Session-Cookie**. Würde der Proxy sie auf
`/login` umleiten, bekäme Safari HTML statt JSON beziehungsweise PNG, und die
Installation schlägt still fehl (oder das Icon ist leer). Deshalb steht
`manifest.webmanifest` im Matcher-Ausschluss; Bilddateien (`.png`) waren dort
schon ausgenommen. Mit `curl` ohne Cookie lässt sich das prüfen.

## Bewusst weggelassen

- **Service Worker / Offline:** Für die Installation auf iOS nicht nötig, und
  das Dashboard zeigt Live-Daten, die offline wertlos wären.
- **Eigener Cookie-Speicher:** Die installierte App hat unter iOS einen
  Speicher getrennt von Safari. Man meldet sich nach der Installation einmal
  neu an. Login, Einladung und `/oauth/*` laufen danach im selben Fenster
  (`scope: "/"`).

## Doku

- Next.js: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`
- [Web App Manifest (MDN)](https://developer.mozilla.org/docs/Web/Manifest)
- [Configuring Web Applications (Apple)](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [`env()` und Safe Area (MDN)](https://developer.mozilla.org/docs/Web/CSS/env)
