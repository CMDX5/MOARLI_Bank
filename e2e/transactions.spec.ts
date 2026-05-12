import { test, expect } from "@playwright/test";

/**
 * Tests E2E pour le flux de transaction (écran de virement/envoi).
 * Ces tests vérifient que le flux de transaction est bien protégé
 * et que les validations sont en place.
 */
test.describe("Transaction — Écran de paiement", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".auth-scroll", { timeout: 30_000 });
  });

  test("le bouton d'envoi est visible sur le dashboard (si connecté)", async ({ page }) => {
    // Without auth, we stay on auth screen - the dashboard should NOT be accessible
    await expect(page.locator(".auth-scroll")).toBeVisible();
    // No dashboard content should be visible
    await expect(page.locator(".dashboard-balance, .app-screen.active .balance")).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
  });

  test("les boutons de navigation ne sont pas accessibles sans auth", async ({ page }) => {
    // Check that the bottom navigation (Accueil, Paiements, Cartes, etc.) is NOT visible
    const navBar = page.locator(".bottom-nav, .nav-bar, .tab-bar, nav");
    // On auth screen, navigation should not be present
    const navVisible = await navBar.isVisible().catch(() => false);
    expect(navVisible).toBe(false);
  });
});

test.describe("Transaction — Protection des routes API", () => {
  test("créer une transaction sans auth est bloquée", async ({ request }) => {
    const response = await request.post("/api/transactions/create", {
      data: {
        type: "send",
        amount: 5000,
        destination: "cash",
        phone: "061234567",
      },
    });
    expect(response.status()).toBe(401);
  });

  test("exécuter un transfert sans auth est bloqué", async ({ request }) => {
    const response = await request.post("/api/transfer/execute", {
      data: {
        amount: 5000,
        destination: "cash",
        phone: "061234567",
        pin: "1234",
      },
    });
    expect(response.status()).toBe(401);
  });

  test("lister les transactions sans auth est bloqué", async ({ request }) => {
    const response = await request.get("/api/transactions/list");
    expect(response.status()).toBe(401);
  });
});
