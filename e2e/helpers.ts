/**
 * Gemeinsame Helfer für die E2E-Tests.
 */
import { expect, type Page } from "@playwright/test";

/** Hier speichert das Setup die Cookies des eingeloggten Testnutzers. */
export const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Zugangsdaten des E2E-Testnutzers aus .env.local.
 * Ein eigener Nutzer nur für Tests – so laufen die Tests nie mit einem echten
 * Konto, und man kann ihn jederzeit sperren oder neu anlegen.
 */
export function getTestUser() {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_USER_EMAIL und E2E_USER_PASSWORD fehlen in .env.local " +
        "(Vorlage: .env.example).",
    );
  }
  return { email, password };
}

/**
 * Meldet sich über das Login-Formular an – genau wie ein Mensch.
 *
 * Locators über Rolle und Beschriftung (getByLabel, getByRole) statt über
 * CSS-Klassen: Sie brechen nicht, wenn sich das Styling ändert, und
 * prüfen nebenbei, dass die Felder korrekt beschriftet sind (Barrierefreiheit).
 */
export async function login(page: Page) {
  const { email, password } = getTestUser();

  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // expect(...) wartet automatisch (Standard: bis zu 5 s), bis die Bedingung
  // erfüllt ist – kein manuelles sleep() nötig.
  await expect(page).toHaveURL("/dashboard");
}
