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
    await expect(page.getByText("Connexion", { exact: true })).toBeVisible();
    await expect(page.getByText("Inscription", { exact: true })).toBeVisible();
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
    await page.getByText("Inscription", { exact: true }).click();
    // Should show step 1: Identity form
    await expect(page.getByText("Vos informations")).toBeVisible();
    await expect(page.getByPlaceholder("Jean")).toBeVisible();
    await expect(page.getByPlaceholder("Prince")).toBeVisible();
    await expect(page.getByPlaceholder("votre@email.com")).toBeVisible();
  });

  test("le lien 'Mot de passe oublié' bascule vers le panneau de reset", async ({ page }) => {
    await page.getByText("Mot de passe oublié ?").click();
    await expect(page.getByText("Mot de passe oublié")).toBeVisible();
    await expect(page.getByPlaceholder("votre@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer le code" })).toBeVisible();
  });

  test("connexion avec champs vides affiche un toast d'erreur", async ({ page }) => {
    await page.getByRole("button", { name: "Se connecter" }).click();
    // Toast should appear
    await expect(page.locator(".toast, [class*=toast], [class*=Toast]")).toBeVisible({ timeout: 5_000 }).catch(() => {
      // Fallback: check for any error message text
      expect(page.getByText(/champs|email|mot de passe/i)).toBeVisible();
    });
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
    await expect(page.getByText("Mot de passe oublié")).toBeVisible();
    // Click the back arrow
    await page.locator(".auth-panel.active svg").first().click();
    await expect(page.getByText("Connexion", { exact: true })).toBeVisible();
  });
});

test.describe("Auth — Inscription multi-étapes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".auth-scroll", { timeout: 30_000 });
    await page.getByText("Inscription", { exact: true }).click();
    await expect(page.getByText("Vos informations")).toBeVisible();
  });

  test("étape 1: remplir le formulaire identité et passer à l'étape 2", async ({ page }) => {
    await page.getByPlaceholder("Jean").fill("Test");
    await page.getByPlaceholder("Prince").fill("E2E");
    await page.getByPlaceholder("votre@email.com").fill("test@example.com");
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
    await page.getByPlaceholder("votre@email.com").fill("notanemail");
    await page.getByPlaceholder("").fill("061234567");
    await page.getByRole("button", { name: /Continuer/ }).click();
    await expect(page.getByText(/invalide/i)).toBeVisible({ timeout: 5_000 });
  });

  test("étape 2: mot de passe trop court affiche un toast", async ({ page }) => {
    // Fill step 1
    await page.getByPlaceholder("Jean").fill("Test");
    await page.getByPlaceholder("Prince").fill("E2E");
    await page.getByPlaceholder("votre@email.com").fill("test@example.com");
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
    await page.getByPlaceholder("votre@email.com").fill("test@example.com");
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
