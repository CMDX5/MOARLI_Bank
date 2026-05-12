import { test, expect } from "@playwright/test";

/**
 * Tests E2E pour le tableau de bord et la navigation principale.
 * Ces tests vérifient que la page principale charge correctement
 * et que les éléments du dashboard sont présents.
 */
test.describe("Dashboard — Chargement et navigation", () => {
  test("la page d'accueil charge le splash screen puis l'écran d'auth", async ({ page }) => {
    await page.goto("/");
    // Should show either "Chargement..." or auth screen
    const loadingOrAuth = await page.locator("#app-root").innerText({ timeout: 30_000 });
    expect(loadingOrAuth.length).toBeGreaterThan(0);
  });

  test("le document a le bon titre et la langue FR", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Morali/i);
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("fr");
  });

  test("pas de fuite d'informations sensibles dans le HTML initial", async ({ page }) => {
    const response = await page.goto("/");
    const html = await response!.text();
    // No API keys, secrets, or tokens in server-rendered HTML
    expect(html).not.toContain("AIza");
    expect(html).not.toContain("sk_live");
    expect(html).not.toContain("service-account-key");
    expect(html).not.toContain("FIREBASE_API_KEY");
    expect(html).not.toContain("NEXT_PUBLIC_FIREBASE_API_KEY");
  });
});

test.describe("Dashboard — Sécurité des en-têtes HTTP", () => {
  test("les en-têtes de sécurité sont présents", async ({ request }) => {
    const response = await request.get("http://localhost:3000");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"] || response.headers()["content-security-policy"]).toBeTruthy();
    // HSTS
    const hsts = response.headers()["strict-transport-security"];
    if (hsts) {
      expect(hsts).toContain("max-age");
    }
    // No server fingerprinting
    expect(response.headers()["x-powered-by"]).toBeFalsy();
  });
});

test.describe("Dashboard — Accessibilité mobile", () => {
  test.use({ ...{ viewport: { width: 390, height: 844 } } });

  test("l'interface s'adapte à la taille mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".auth-scroll", { timeout: 30_000 });
    // Auth elements should be visible on mobile viewport
    await expect(page.locator(".auth-brand-name")).toBeVisible();
    await expect(page.locator(".auth-tabs")).toBeVisible();
  });

  test("le meta viewport est configuré correctement", async ({ page }) => {
    await page.goto("/");
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewportMeta).toContain("width=device-width");
    expect(viewportMeta).toContain("initial-scale=1");
    expect(viewportMeta).toContain("user-scalable=false");
  });
});
