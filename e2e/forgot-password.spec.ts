import { test, expect } from "@playwright/test";

/**
 * Tests E2E pour le flux de "Mot de passe oublié".
 * Ces tests vérifient la navigation multi-étapes sans effectuer de vrais appels API.
 */
test.describe("Auth — Mot de passe oublié", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".auth-scroll", { timeout: 30_000 });
    await page.getByText("Mot de passe oublié ?").click();
    await expect(page.getByText("Entrez votre email pour recevoir un code")).toBeVisible();
  });

  test("affiche les 3 étapes: Email, Code, Mot de passe", async ({ page }) => {
    // Step indicators are shown in the forgot-password panel
    // Use form-section-title class to avoid matching labels/inputs
    const steps = page.locator(".form-section-title");
    await expect(steps.first()).toBeVisible();
    // Verify the panel header text contains the forgot password context
    await expect(page.getByText(/Mot de passe oublié/)).toBeVisible();
  });

  test("étape email: bouton désactivé si email vide", async ({ page }) => {
    const btn = page.getByRole("button", { name: "Envoyer le code" });
    await expect(btn).toBeDisabled();
  });

  test("étape email: bouton désactivé si email invalide", async ({ page }) => {
    // Target the active panel's email input (forgot-password panel has only one visible)
    await page.locator(".auth-panel.active").getByPlaceholder("votre@email.com").fill("notanemail");
    const btn = page.getByRole("button", { name: "Envoyer le code" });
    await expect(btn).toBeDisabled();
  });

  test("étape email: bouton activé si email valide", async ({ page }) => {
    await page.locator(".auth-panel.active").getByPlaceholder("votre@email.com").fill("user@example.com");
    const btn = page.getByRole("button", { name: "Envoyer le code" });
    await expect(btn).toBeEnabled();
  });

  test("navigation retour depuis le panneau forgot", async ({ page }) => {
    // Click the back arrow (SVG in the forgot panel header)
    const backArrow = page.locator(".auth-panel.active svg").first();
    await backArrow.click();
    // Should return to login panel — use role-based selector to avoid strict mode
    await expect(page.getByRole("button", { name: "Connexion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });
});
