/**
 * Setup-Projekt: Einmal einloggen und die Session speichern.
 *
 * `storageState` schreibt Cookies (und localStorage) in eine JSON-Datei. Das
 * Projekt "authenticated" lädt diese Datei vor jedem Test – die Tests starten
 * also schon eingeloggt. Das spart Zeit und Anfragen an den Auth-Server.
 *
 * Die Datei enthält echte Session-Tokens → per .gitignore ausgeschlossen.
 */
import { test as setup } from "@playwright/test";

import { AUTH_FILE, login } from "./helpers";

setup("Testnutzer einloggen", async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: AUTH_FILE });
});
