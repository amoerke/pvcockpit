/**
 * Konfiguration für die E2E-Tests (Playwright).
 *
 * Ausführen:  npm run test:e2e        (alle Tests, headless)
 *             npm run test:e2e:ui     (interaktive UI zum Zuschauen/Debuggen)
 *
 * Doku: https://playwright.dev/docs/test-configuration
 */
import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

import { AUTH_FILE } from "./e2e/helpers";

// Dieselben .env-Dateien laden wie `next dev` – so stehen E2E_USER_EMAIL und
// E2E_USER_PASSWORD aus .env.local auch in den Tests bereit.
// (Das zweite Argument `true` = Entwicklungsmodus; im Testmodus würde
// Next.js .env.local absichtlich NICHT laden.)
loadEnvConfig(process.cwd(), true);

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",

  // Tests laufen parallel in mehreren Browser-Instanzen ("Workers").
  fullyParallel: true,
  // Ein vergessenes `test.only` soll in CI nicht still alle anderen Tests
  // überspringen.
  forbidOnly: Boolean(process.env.CI),
  // Netzwerk zum Auth-Server kann mal haken – in CI ein zweiter Versuch.
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // Bei einem Fehlschlag einen "Trace" aufzeichnen: Schritt-für-Schritt-
    // Aufnahme mit DOM, Netzwerk und Konsole (ansehen: npx playwright show-trace …).
    trace: "retain-on-failure",
    locale: "de-DE",
  },

  // "Projekte" sind Gruppen von Tests mit eigener Konfiguration.
  projects: [
    // 1. Einmal einloggen und die Session-Cookies in AUTH_FILE speichern.
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    // 2. Tests OHNE Login (Gast).
    {
      name: "guest",
      testMatch: /.*\.guest\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // 3. Tests MIT Login: starten direkt mit den gespeicherten Cookies –
    //    ohne sich in jedem Test neu einzuloggen.
    {
      name: "authenticated",
      testMatch: /.*\.auth\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
  ],

  // Playwright startet den Dev-Server selbst – oder nutzt einen, der schon
  // läuft (lokal praktisch: `npm run dev` kann offen bleiben).
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
