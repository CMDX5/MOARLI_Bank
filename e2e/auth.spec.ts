import { test, expect } from "@playwright/test";

test.describe("Auth — Page de connexion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for MoraliApp to load (dynamic import)
    await page.waitForSelector(".auth-scroll", { timeout: 30_000 });
  });

  test("affiche le logo MORALI PAY et les onglets Connexion / Inscription", async ({ page }) => {
    await expect(page.locator(".auth-brand-name")).toHaveText("MORALI");
    await expect(page.locator(".auth-brand-sub")).toHaveText("PAY");
    // Use role-based selectors to avoid strict mode (text exists in both tab and form-section-title)
    await expect(page.getByRole("button", { name: "Connexion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inscription" })).toBeVisible();
  });

  test("l'onglet Connexion est actif par défaut", async ({ page }) => {
    const loginTab = page.locator(".auth-tab").first();
    await expect(loginTab).toHaveClass(/active/);
  });

  test("affiche les champs email et mot de passe sur l'onglet Connexion", async ({ page }) => {
    await expect(page.getByPlaceholder("votre@email.com").first()).toBeVisible();
    await expect(page.getByPlaceholder("••••••••").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("basculer vers l'onglet Inscription affiche le formulaire d'inscription", async ({ page }) => {
    await page.getByRole("button", { name: "Inscription" }).click();
    // Should show step 1: Identity form
    await expect(page.getByText("Vos informations")).toBeVisible();
    await expect(page.getByPlaceholder("Jean")).toBeVisible();
    await expect(page.getByPlaceholder("Prince")).toBeVisible();
    // Email placeholder exists in multiple panels; target the active panel's input
    await expect(page.locator(".auth-panel.active").getByPlaceholder("votre@email.com")).toBeVisible();
  });

  test("le lien 'Mot de passe oublié' bascule vers le panneau de reset", async ({ page }) => {
    await page.getByText("Mot de passe oublié ?").click();
    // The forgot panel shows "Mot de passe oublié" as its form-section-title
    await expect(page.locator(".auth-panel.active .form-section-title")).toHaveText("Mot de passe oublié");
    await expect(page.locator(".auth-panel.active").getByPlaceholder("votre@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer le code" })).toBeVisible();
  });

  test("connexion avec champs vides affiche un toast d'erreur", async ({ page }) => {
    await page.getByRole("button", { name: "Se connecter" }).click();
    // Toast should appear with class "toast"
    await expect(page.locator('[class*="toast"][class*="show"]')).toBeVisible({ timeout: 5_000 });
  });

  test("connexion avec email invalide affiche un toast", async ({ page }) => {
    await page.getByPlaceholder("votre@email.com").first().fill("invalidemail");
    await page.getByPlaceholder("••••••••").first().fill("password123");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText(/invalide/i)).toBeVisible({ timeout: 5_000 });
  });

  test("le lien 'S'inscrire' dans le panneau login bascule vers inscription", async ({ page }) => {
    await page.getByText("S'inscrire").click();
    await expect(page.getByText("Vos informations")).toBeVisible();
  });

  test("le bouton retour depuis 'Mot de passe oublié' revient à la connexion", async ({ page }) => {
    await page.getByText("Mot de passe oublié ?").click();
    await expect(page.locator(".auth-panel.active .form-section-title")).toHaveText("Mot de passe oublié");
    // Click the back arrow
    await page.locator(".auth-panel.active svg").first().click();
    // Login tab should be visible again
    await expect(page.getByRole("button", { name: "Connexion" })).toBeVisible();
  });
});

test.describe("Auth — Inscription multi-étapes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".auth-scroll", { timeout: 30_000 });
    await page.getByRole("button", { name: "Inscription" }).click();
    await expect(page.getByText("Vos informations")).toBeVisible();
  });

  test("étape 1: remplir le formulaire identité et passer à l'étape 2", async ({ page }) => {
    await page.getByPlaceholder("Jean").fill("Test");
    await page.getByPlaceholder("Prince").fill("E2E");
    await page.locator(".auth-panel.active").getByPlaceholder("votre@email.com").fill("test@example.com");
    await page.getByPlaceholder("").fill("061234567"); // phone input (no placeholder text)
    await page.getByRole("button", { name: /Continuer/ }).click();
    // Should show step 2: Security
    await expect(page.getByText("Sécurité du compte")).toBeVisible();
  });

  test("étape 1: champ manquant affiche un toast", async ({ page }) => {
    await page.getByPlaceholder("Jean").fill("Test");
    // Leave other fields empty
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText(/champs/i)).toBeVisible({ timeout: 5_000 });
  });

  test("étape 1: email invalide affiche un toast", async ({ page }) => {
    await page.getByPlaceholder("Jean").fill("Test");
    await page.getByPlaceholder("Prince").fill("E2E");
    await page.locator(".auth-panel.active").getByPlaceholder("votre@email.com").fill("notanemail");
    await page.getByPlaceholder("").fill("061234567");
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText(/invalide/i)).toBeVisible({ timeout: 5_000 });
  });

  test("étape 2: mot de passe trop court affiche un toast", async ({ page }) => {
    // Fill step 1
    await page.getByPlaceholder("Jean").fill("Test");
    await page.getByPlaceholder("Prince").fill("E2E");
    await page.locator(".auth-panel.active").getByPlaceholder("votre@email.com").fill("test@example.com");
    await page.getByPlaceholder("").fill("061234567");
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText("Sécurité du compte")).toBeVisible();

    // Fill step 2 with short password
    await page.getByPlaceholder("Minimum 8 caractères").fill("short");
    await page.getByPlaceholder("Confirmez le mot de passe").fill("short");
    // Accept terms checkbox
    await page.getByText(/conditions/i).click();
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText(/trop court|8 min/i)).toBeVisible({ timeout: 5_000 });
  });

  test("étape 2: mots de passe différents affichent un toast", async ({ page }) => {
    await page.getByPlaceholder("Jean").fill("Test");
    await page.getByPlaceholder("Prince").fill("E2E");
    await page.locator(".auth-panel.active").getByPlaceholder("votre@email.com").fill("test@example.com");
    await page.getByPlaceholder("").fill("061234567");
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText("Sécurité du compte")).toBeVisible();

    await page.getByPlaceholder("Minimum 8 caractères").fill("password123");
    await page.getByPlaceholder("Confirmez le mot de passe").fill("different456");
    await page.getByText(/conditions/i).click();
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText(/correspondent pas/i)).toBeVisible({ timeout: 5_000 });
  });
});
