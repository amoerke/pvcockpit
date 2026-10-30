/**
 * Auth-Tests OHNE gespeicherte Session (Gast).
 */
import { expect, test, type Page } from "@playwright/test";

import { getTestUser, login } from "./helpers";

// Hinweis: Locators für Meldungen sind auf <main> begrenzt. Next.js rendert
// zusätzlich einen unsichtbaren "Route Announcer" mit role="alert" (sagt
// Screenreadern Seitenwechsel an) – ein globales getByRole("alert") wäre
// sonst mehrdeutig, und Playwright bricht im "strict mode" ab.
test.describe("Ohne Login", () => {
  test("geschützte Seite leitet zum Login weiter", async ({ page }) => {
    await page.goto("/dashboard");
    // ?next= merkt sich das Ziel für den Rücksprung nach dem Login.
    await expect(page).toHaveURL("/login?next=%2Fdashboard");
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
    await expect(page).toHaveURL("/login?next=%2Fdashboard");
  });

  // OAuth: Wer vom Client kommt und nicht angemeldet ist, muss nach dem
  // Login zur Zustimmung zurück – MIT der authorization_id.
  test("Login führt zurück zur OAuth-Zustimmung", async ({ page }) => {
    await page.goto("/oauth/consent?authorization_id=e2e-test");
    await expect(page).toHaveURL("/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3De2e-test");

    await fillLogin(page);
    await expect(page).toHaveURL("/oauth/consent?authorization_id=e2e-test");
    // Die ID ist erfunden, Supabase kennt sie nicht.
    await expect(page.getByRole("main").getByRole("alert")).toContainText("ungültig oder abgelaufen");
  });

  test("Login ignoriert fremde Rücksprung-Ziele", async ({ page }) => {
    // "//boese.example" ist für Browser eine andere Website (Open Redirect).
    await page.goto("/login?next=//boese.example/login");
    await fillLogin(page);
    await expect(page).toHaveURL("/dashboard");
  });
});

/** Login-Formular ausfüllen, ohne wie login() auf /dashboard zu bestehen. */
async function fillLogin(page: Page) {
  const { email, password } = getTestUser();
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}
