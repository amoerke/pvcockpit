/**
 * Auth-Tests OHNE gespeicherte Session (Gast).
 */
import { expect, test } from "@playwright/test";

import { getTestUser, login } from "./helpers";

// Hinweis: Locators für Meldungen sind auf <main> begrenzt. Next.js rendert
// zusätzlich einen unsichtbaren "Route Announcer" mit role="alert" (sagt
// Screenreadern Seitenwechsel an) – ein globales getByRole("alert") wäre
// sonst mehrdeutig, und Playwright bricht im "strict mode" ab.
test.describe("Ohne Login", () => {
  test("geschützte Seite leitet zum Login weiter", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });

  test("leeres Formular zeigt Feldfehler", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(
      page.getByText("Bitte eine gültige E-Mail-Adresse eingeben."),
    ).toBeVisible();
    await expect(page.getByText("Bitte das Passwort eingeben.")).toBeVisible();
  });

  test("falsche Zugangsdaten zeigen eine allgemeine Meldung", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(getTestUser().email);
    await page.getByLabel("Passwort").fill("definitiv-nicht-das-passwort");
    await page.getByRole("button", { name: "Anmelden" }).click();

    // Bewusst dieselbe Meldung wie bei unbekannter E-Mail (keine User Enumeration).
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "E-Mail oder Passwort ist falsch.",
    );
    // Die E-Mail bleibt nach dem Fehler im Feld stehen.
    await expect(page.getByLabel("E-Mail")).toHaveValue(getTestUser().email);
  });

  test("ungültiger Mail-Link führt mit Hinweis zum Login", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=ungueltig&type=invite");

    await expect(page).toHaveURL("/login?error=invalid_link");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Der Link ist ungültig oder abgelaufen.",
    );
  });

  test("Passwort vergessen antwortet neutral", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Passwort vergessen?" }).click();
    await expect(page).toHaveURL("/auth/forgot-password");

    // Adresse ohne Konto → es wird keine Mail verschickt, die Antwort ist
    // trotzdem dieselbe.
    await page.getByLabel("E-Mail").fill("niemand@example.com");
    await page.getByRole("button", { name: "Link anfordern" }).click();

    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "ein Konto existiert",
    );
  });

  // Login + Logout als EIN Ablauf mit eigener, frischer Session.
  // Nicht im Projekt "authenticated": Der Logout widerruft die Session –
  // die gespeicherte Session der anderen Tests wäre danach ungültig.
  test("Login und Logout", async ({ page }) => {
    await login(page);
    await expect(page.getByText(getTestUser().email).first()).toBeVisible();

    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL("/login");

    // Nach dem Logout ist das Dashboard wieder gesperrt.
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });
});
