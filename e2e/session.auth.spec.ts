/**
 * Auth-Tests MIT Login – starten mit der Session aus auth.setup.ts.
 *
 * Wichtig: Kein Test hier darf sich abmelden, sonst wäre die gemeinsame
 * gespeicherte Session für alle anderen Tests ungültig.
 */
import { expect, test } from "@playwright/test";

import { getTestUser } from "./helpers";

test.describe("Mit Login", () => {
  test("Dashboard zeigt die E-Mail des Nutzers", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText(getTestUser().email).first()).toBeVisible();
  });

  test("Startseite leitet zum Dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/dashboard");
  });

  test("Login-Seite leitet eingeloggte Nutzer zum Dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/dashboard");
  });
});
