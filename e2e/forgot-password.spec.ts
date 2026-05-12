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
    await expect(page.getByText("Email")).toBeVisible();
    await expect(page.getByText("Code")).toBeVisible();
    await expect(page.getByText("Mot de passe")).toBeVisible();
  });

  test("étape email: bouton désactivé si email vide", async ({ page }) => {
    const btn = page.getByRole("button", { name: "Envoyer le code" });
    await expect(btn).toBeDisabled();
  });

  test("étape email: bouton désactivé si email invalide", async ({ page }) => {
    await page.getByPlaceholder("votre@email.com").fill("notanemail");
    const btn = page.getByRole("button", { name: "Envoyer le code" });
    await expect(btn).toBeDisabled();
  });

  test("étape email: bouton activé si email valide", async ({ page }) => {
    await page.getByPlaceholder("votre@email.com").fill("user@example.com");
    const btn = page.getByRole("button", { name: "Envoyer le code" });
    await expect(btn).toBeEnabled();
  });

  test("navigation retour depuis le panneau forgot", async ({ page }) => {
    // Click the back arrow (SVG in the forgot panel header)
    const backArrow = page.locator(".auth-panel.active svg").first();
    await backArrow.click();
    // Should return to login panel
    await expect(page.getByText("Connexion", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });
});
