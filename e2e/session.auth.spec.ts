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

  test("Navigation wechselt zwischen Übersicht und Verlauf", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });

    await nav.getByRole("link", { name: "Verlauf" }).click();
    await expect(page).toHaveURL("/dashboard/history");
    // aria-current="page" markiert den aktiven Menüpunkt.
    await expect(nav.getByRole("link", { name: "Verlauf" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await nav.getByRole("link", { name: "Übersicht" }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  test("Verlauf: Tag steht in der URL und lässt sich wechseln", async ({ page }) => {
    // Fester Tag in der Vergangenheit – der Test hängt nicht vom heutigen Datum ab.
    await page.goto("/dashboard/history?date=2026-10-10");
    const nav = page.getByRole("navigation", { name: "Tag wählen" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Samstag, 10. Oktober 2026",
    );

    await nav.getByRole("link", { name: "Vorheriger Tag" }).click();
    await expect(page).toHaveURL("/dashboard/history?date=2026-10-09");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Freitag, 9. Oktober 2026",
    );

    // "Heute": ohne ?date=, und in die Zukunft geht es nicht weiter.
    await nav.getByRole("link", { name: "Heute" }).click();
    await expect(page).toHaveURL("/dashboard/history");
    await expect(nav.getByRole("button", { name: "Nächster Tag" })).toBeDisabled();
  });

  test("Verlauf: ungültiges Datum zeigt heute", async ({ page }) => {
    await page.goto("/dashboard/history?date=2026-02-30");
    // Ohne Pfeil "Nächster Tag" als Link → es ist der heutige Tag.
    await expect(
      page.getByRole("navigation", { name: "Tag wählen" }).getByRole("button", {
        name: "Nächster Tag",
      }),
    ).toBeDisabled();
  });

  test("Verlauf: Zeitraum steht in der URL und lässt sich wechseln", async ({ page }) => {
    await page.goto("/dashboard/history");
    const ranges = page.getByRole("navigation", { name: "Zeitraum wählen" });
    // exact: Ohne würde "Tag" auch "7 Tage" und "30 Tage" treffen (Teiltext).
    await expect(ranges.getByRole("link", { name: "Tag", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await ranges.getByRole("link", { name: "7 Tage" }).click();
    await expect(page).toHaveURL("/dashboard/history?range=7d");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Letzte 7 Tage");
    await expect(ranges.getByRole("link", { name: "7 Tage" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await ranges.getByRole("link", { name: "Jahr" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Letzte 12 Monate");
  });

  test("Verlauf: ungültiger Zeitraum zeigt die Tagesansicht", async ({ page }) => {
    // "toString" steckt in jedem Objekt – parseRange() darf es trotzdem nicht annehmen.
    await page.goto("/dashboard/history?range=toString");
    await expect(page.getByRole("navigation", { name: "Tag wählen" })).toBeVisible();
  });

  test("Ersparnis: Zeitraum und Ansicht bleiben beim Umschalten erhalten", async ({ page }) => {
    await page.goto("/dashboard");
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Ersparnis" })
      .click();
    await expect(page).toHaveURL("/dashboard/savings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ersparnis · Letzte 30 Tage",
    );

    const ranges = page.getByRole("navigation", { name: "Zeitraum wählen" });
    const views = page.getByRole("navigation", { name: "Ansicht wählen" });

    await views.getByRole("link", { name: "Einspeisung" }).click();
    await expect(page).toHaveURL("/dashboard/savings?view=feedin");

    // Zeitraum wechseln – die Ansicht muss in der URL bleiben.
    await ranges.getByRole("link", { name: "7 Tage" }).click();
    await expect(page).toHaveURL("/dashboard/savings?range=7d&view=feedin");
    await expect(views.getByRole("link", { name: "Einspeisung" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Und umgekehrt: Ansicht wechseln behält den Zeitraum.
    await views.getByRole("link", { name: "Gesamt" }).click();
    await expect(page).toHaveURL("/dashboard/savings?range=7d");
  });

  test("Ersparnis: ungültige Werte fallen auf den Standard zurück", async ({ page }) => {
    await page.goto("/dashboard/savings?range=toString&view=toString");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ersparnis · Letzte 30 Tage",
    );
    await expect(
      page.getByRole("navigation", { name: "Ansicht wählen" }).getByRole("link", { name: "Gesamt" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("Ersparnis: Alles zeigt den Zeitraum seit Beginn", async ({ page }) => {
    await page.goto("/dashboard/savings?view=savings");
    await page
      .getByRole("navigation", { name: "Zeitraum wählen" })
      .getByRole("link", { name: "Alles" })
      .click();
    await expect(page).toHaveURL("/dashboard/savings?range=all&view=savings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ersparnis · Seit Beginn",
    );
    // Welcher Bucket (Tag/Monat/Jahr) gilt, hängt vom Datum ab – geprüft wird
    // nur, dass Daten da sind (seit 15.09.2026 gibt es einen Tarif).
    await expect(page.getByText(/^Summe über \d+ von \d+ Tagen/)).toBeVisible();
  });

  test("Theme-Umschalter setzt das dunkle Farbschema", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Farbschema wählen" }).click();
    await page.getByRole("menuitemradio", { name: "Dunkel" }).click();

    // next-themes setzt die Klasse "dark" am <html>-Element …
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    // … und merkt sich die Wahl über einen Seitenwechsel hinweg.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});
